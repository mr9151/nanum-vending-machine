#!/data/data/com.termux/files/usr/bin/bash
# 10분마다 1회 수집·업로드. 실패해도 멈추지 않고 다음 회차에 다시 시도. 6시간마다 수집기 코드 자동 업데이트
cd "$HOME/nanum" || exit 1
n=0
while true; do
  if [ $((n % 36)) -eq 0 ]; then git pull -q >/dev/null 2>&1 && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1; fi
  node scripts/joongna-collector.mjs >> collector.log 2>&1
  # 기록 파일이 너무 커지지 않게 최근 500줄만 유지
  tail -n 500 collector.log > collector.log.tmp && mv collector.log.tmp collector.log
  n=$((n + 1))
  sleep 600
done
