# DailySnap macOS 安装包
# 部署：build 完 app 后把 .dmg 拷到这里
#   pnpm tauri build  →  src-tauri/target/release/bundle/dmg/DailySnap_*.dmg
#   scp src-tauri/target/release/bundle/dmg/*.dmg ubuntu@<server>:/opt/dailysnap/nginx/html/downloads/DailySnap.dmg