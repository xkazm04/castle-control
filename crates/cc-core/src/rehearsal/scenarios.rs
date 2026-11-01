use super::{Door, unavailable};
use crate::{Module, beacons::BeaconsModule, lots::LotsModule};
use cc_types::*;
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
pub(super) struct Actions {
    pub lots: Arc<LotsModule>,
    pub tiltyard: Arc<crate::tiltyard::TiltyardModule>,
    pub beacons: Arc<BeaconsModule>,
    pub configuration: Arc<tokio::sync::Mutex<()>>,
    pub message_delay: Duration,
}
impl Actions {
    pub async fn run(
        &self,
        params: RehearsalScenarioParams,
        door: Arc<Door>,
    ) -> Result<(), ErrorEnvelope> {
        if params.scenario == RehearsalScenario::DuelRound {
            self.duel().await?;
        }
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
                RehearsalScenario::DuelRound if index % 3 == 2 => "2! SIMULATED",
                RehearsalScenario::DuelRound => "1 SIMULATED",
                RehearsalScenario::BeaconFire => return Err(unavailable()),
            };
            if params.scenario == RehearsalScenario::DuelRound {
                door.send_text(body)?;
            } else {
                door.send(body)?;
            }
            if self.message_delay.is_zero() {
                // Tests can drive a complete burst without wall-clock pacing;
                // still let the consumer run and cancellation take effect.
                tokio::task::yield_now().await;
            } else {
                tokio::time::sleep(self.message_delay).await;
            }
        }
        Ok(())
    }

    async fn duel(&self) -> Result<(), ErrorEnvelope> {
        if self
            .tiltyard
            .stage()
            .await?
            .session
            .is_some_and(|s| s.phase == TiltyardSessionPhase::Live)
        {
            return Ok(());
        }
        let items = ["Castle", "Forest", "Sea", "Sky"]
            .iter()
            .enumerate()
            .map(|(index, name)| {
                Ok(TiltyardContestant {
                    id: format!("sample-{}", name.to_lowercase())
                        .try_into()
                        .map_err(|_| unavailable())?,
                    title: format!("Sample: {name}")
                        .try_into()
                        .map_err(|_| unavailable())?,
                    by: "SIMULATED rehearsal"
                        .to_owned()
                        .try_into()
                        .map_err(|_| unavailable())?,
                    seed: index.to_string().try_into().map_err(|_| unavailable())?,
                    note: Some(
                        "Generated SIMULATED sample data"
                            .to_owned()
                            .try_into()
                            .map_err(|_| unavailable())?,
                    ),
                })
            })
            .collect::<Result<Vec<_>, ErrorEnvelope>>()?;
        self.tiltyard
            .start_sample(
                TiltyardList {
                    title: "Sample: SIMULATED tournament"
                        .to_owned()
                        .try_into()
                        .map_err(|_| unavailable())?,
                    prompt: None,
                    items,
                },
                "sample-rehearsal"
                    .to_owned()
                    .try_into()
                    .map_err(|_| unavailable())?,
                60_000.try_into().map_err(|_| unavailable())?,
            )
            .await?;
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
