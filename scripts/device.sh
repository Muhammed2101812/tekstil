#!/usr/bin/env bash
# Test Telefonu (Redmi Note 9S) Otomasyon & Kontrol Aracı
DEVICE_IP="${TEST_DEVICE_IP:-192.168.1.104}"
DEVICE_PORT="${TEST_DEVICE_PORT:-5555}"
DEVICE="${DEVICE_IP}:${DEVICE_PORT}"

export ANDROID_HOME="${ANDROID_HOME:-/home/muhammed/Android/Sdk}"
export PATH="${ANDROID_HOME}/platform-tools:${PATH}"

ensure_connected() {
  if ! adb devices | grep -q "${DEVICE}.*device"; then
    echo "Bağlantı kuruluyor: ${DEVICE}..."
    adb connect "${DEVICE}" >/dev/null 2>&1
    sleep 1
  fi
  if ! adb devices | grep -q "${DEVICE}.*device"; then
    # IP değişmiş olabilir, mDNS servisi tara
    local mdns_addr
    mdns_addr=$(adb mdns services 2>/dev/null | grep "_adb-tls-connect" | awk '{print $3}' | head -n 1)
    if [ -n "$mdns_addr" ]; then
      echo "mDNS üzerinden yeni adres bulundu: ${mdns_addr}"
      adb connect "${mdns_addr}" >/dev/null 2>&1
      adb -s "${mdns_addr}" tcpip 5555 >/dev/null 2>&1
      DEVICE_IP=$(echo "$mdns_addr" | cut -d: -f1)
      DEVICE="${DEVICE_IP}:5555"
      sleep 1
      adb connect "${DEVICE}" >/dev/null 2>&1
    fi
  fi
}

wake() {
  ensure_connected
  adb -s "${DEVICE}" shell input keyevent KEYCODE_WAKEUP
  adb -s "${DEVICE}" shell wm dismiss-keyguard
  echo "Telefon uyandırıldı ve ekran açıldı."
}

sleep_screen() {
  ensure_connected
  adb -s "${DEVICE}" shell input keyevent KEYCODE_SLEEP
  echo "Ekran uyku moduna alındı."
}

status() {
  ensure_connected
  echo "--- Cihaz Durumu ---"
  adb -s "${DEVICE}" shell getprop ro.product.model | tr -d '\r' | sed 's/^/Model: /'
  adb -s "${DEVICE}" shell dumpsys battery | grep level | tr -d '\r' | sed 's/^/Pil: /'
  adb -s "${DEVICE}" shell dumpsys power | grep mWakefulness= | head -n 1 | tr -d '\r' | sed 's/^/Ekran: /'
  adb -s "${DEVICE}" shell dumpsys window | grep -E "mCurrentFocus" | head -n 1 | tr -d '\r' | sed 's/^/Odak: /'
}

screenshot() {
  ensure_connected
  local out="${1:-/tmp/phone_screen.png}"
  adb -s "${DEVICE}" exec-out screencap -p > "$out"
  echo "Ekran görüntüsü kaydedildi: $out"
}

case "$1" in
  wake) wake ;;
  sleep) sleep_screen ;;
  status) status ;;
  screenshot) screenshot "$2" ;;
  connect) ensure_connected; echo "Bağlandı: ${DEVICE}" ;;
  *)
    ensure_connected
    if [ -n "$1" ]; then
      adb -s "${DEVICE}" "$@"
    else
      status
    fi
    ;;
esac
