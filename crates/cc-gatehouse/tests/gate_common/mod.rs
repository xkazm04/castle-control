pub fn actor() -> cc_gatehouse::gate::GateActor {
    cc_gatehouse::gate::GateActor {
        user_id: cc_store::TwitchUserId::parse("200").unwrap(),
        login: "sim_moderator".into(),
        simulated: true,
    }
}
