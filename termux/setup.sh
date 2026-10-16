#!/data/data/com.termux/files/usr/bin/bash
# 나눔자판기 중고나라 수집기 — 갤럭시 폰(Termux) 24시간 실행 설치
# 사용법(Termux에서 한 줄):
#   curl -fsSL https://raw.githubusercontent.com/mr9151/nanum-vending-machine/main/termux/setup.sh | bash
set -e
DIR="$HOME/nanum"
echo "1/4 패키지 설치 (몇 분 걸려요)"
pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs-lts git >/dev/null

echo "2/4 수집기 내려받기"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q; else git clone -q https://github.com/mr9151/nanum-vending-machine "$DIR"; fi
cd "$DIR" && npm ci --omit=dev --no-audit --no-fund >/dev/null

echo "3/4 업로드 토큰 설정"
if [ ! -s "$DIR/.env.collector" ]; then
  printf "PC의 나눔자판기\.env.collector 파일에 있는 INGEST_TOKEN 값을 붙여넣고 Enter: "
  read -r TOKEN </dev/tty
  [ -n "$TOKEN" ] || { echo "토큰이 비어 있어요. 다시 실행해 주세요"; exit 1; }
  printf 'INGEST_TOKEN=%s\n' "$TOKEN" > "$DIR/.env.collector"
  chmod 600 "$DIR/.env.collector"
fi

echo "4/4 자동 실행 등록"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/nanum-collector.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
# 폰이 켜지면 자동 시작 (Termux:Boot 앱 필요). 화면이 꺼져도 멈추지 않게 wake-lock
termux-wake-lock
exec "$HOME/nanum/termux/run.sh"
BOOT
chmod +x "$HOME/.termux/boot/nanum-collector.sh" "$DIR/termux/run.sh"
pkill -f "nanum/termux/run.sh" 2>/dev/null || true
termux-wake-lock 2>/dev/null || true
nohup "$DIR/termux/run.sh" >/dev/null 2>&1 &
sleep 20
tail -n 3 "$DIR/collector.log" 2>/dev/null || true
echo "완료! 10분마다 중고나라 나눔을 수집해 올려요. 기록 보기: tail -f ~/nanum/collector.log"
