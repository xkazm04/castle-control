fn main() {
    let manifest =
        tauri_build::AppManifest::new().commands(&["enter_rehearsal", "leave_rehearsal"]);
    let attributes = tauri_build::Attributes::new().app_manifest(manifest);
    tauri_build::try_build(attributes).expect("desktop build configuration failed");
}
