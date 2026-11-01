use super::{Door, unavailable};
use crate::{Module, beacons::BeaconsModule, lots::LotsModule};
use cc_types::*;
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
pub(super) struct Actions {
    pub lots: Arc<LotsModule>,
    pub beacons: Arc<BeaconsModule>,
    pub configuration: Arc<tokio::sync::Mutex<()>>,
}
impl Actions {
    pub async fn run(
        &self,
        params: RehearsalScenarioParams,
        door: Arc<Door>,
    ) -> Result<(), ErrorEnvelope> {
        let (count, entry) = match params.scenario {
            RehearsalScenario::LotsFill => (20, Some(self.draw().await?)),
            RehearsalScenario::VoteRound | RehearsalScenario::DuelRound => (30, None),
            RehearsalScenario::BeaconFire => {
                let request = RpcRequest::Simulate(BeaconsSimulateParams {
                    visual_id: params.visual_id.ok_or_else(unavailable)?,
                    burst: SimulatedBurst {
                        source: ContributionSource::Cheer,
                        amount: 100,
                    },
                });
                request.validate_result(self.beacons.call(&request).await?)?;
                return Ok(());
            }
        };
        let ballots =
            (params.scenario == RehearsalScenario::VoteRound).then(super::directions::ballots);
        for index in 0..count {
            let body = match params.scenario {
                RehearsalScenario::LotsFill => entry.as_deref().ok_or_else(unavailable)?,
                RehearsalScenario::VoteRound => ballots.as_ref().ok_or_else(unavailable)?[index],
                RehearsalScenario::DuelRound if index % 3 == 2 => "duel ballot right",
                RehearsalScenario::DuelRound => "duel ballot left",
                RehearsalScenario::BeaconFire => return Err(unavailable()),
            };
            door.send(body)?;
            tokio::time::sleep(Duration::from_millis(180)).await;
        }
        Ok(())
    }

    async fn draw(&self) -> Result<String, ErrorEnvelope> {
        let _configuration = self.configuration.lock().await;
        // Reuse an accepting rehearsal pool without resetting its entries. A
        // sealed pool stays frozen; only then create another dedicated draw.
        let list = RpcRequest::DrawList(Empty {});
        let draws: DrawListResult =
            serde_json::from_value(list.validate_result(self.lots.handle(&list)?)?)
                .map_err(|_| unavailable())?;
        for draw in draws.draws {
            if draw.draw_id.as_str().starts_with("simulated-rehearsal-")
                && let LotsPool::Keyword { keyword } = &draw.rules.pool
                && String::from(keyword.clone()) == "!join"
            {
                let lookup = RpcRequest::RollLookup(RollLookupParams {
                    draw_id: draw.draw_id,
                    user_id: "1".to_owned().try_into().map_err(|_| unavailable())?,
                });
                match self.lots.handle(&lookup) {
                    Ok(value) => {
                        lookup.validate_result(value)?;
                        return Ok("!join".into());
                    }
                    Err(error) if error.code == ErrorCode::Conflict => continue,
                    Err(error) => return Err(error),
                }
            }
        }
        let draw_id = format!(
            "simulated-rehearsal-{}",
            ulid::Ulid::new().to_string().to_lowercase()
        );
        let keyword = "!join";
        let request = RpcRequest::DrawUpsert(DrawUpsertParams {
            draw: LotsDraw {
                draw_id: draw_id.try_into().map_err(|_| unavailable())?,
                name: "SIMULATED rehearsal questions".into(),
                policy: LotsDrawPolicy {
                    content: DrawContent::Question,
                    paid_entry: false,
                    paid_weight: false,
                    subscriber_only: false,
                    channel_points: false,
                    free_entry_equal_odds: true,
                    minimum_age: None,
                    regions: vec![],
                    prize_value_usd_cents: 0_u64.try_into().map_err(|_| unavailable())?,
                    registration_confirmed: false,
                    official_rules: true,
                    twitch_disclaimer: true,
                },
                rules: LotsRollRules {
                    pool: LotsPool::Keyword {
                        keyword: keyword.to_owned().try_into().map_err(|_| unavailable())?,
                    },
                    winner_count: 1.try_into().expect("positive constant"),
                    cooldown_s: 0,
                    cohort_caps: vec![],
                    weight_curve: LotsWeightCurve::Equal,
                    free_join_equal_odds: true,
                },
                image: None,
            },
            display: None,
        });
        request.validate_result(self.lots.handle(&request)?)?;
        Ok(keyword.into())
    }
}
