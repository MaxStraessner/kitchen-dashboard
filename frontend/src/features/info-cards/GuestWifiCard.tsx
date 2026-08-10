import { Card } from '../../components/Card'

const guestWifiQrCode = '/assets/wlan-gastzugang.png'

export function GuestWifiCard() {
  return (
    <Card className="info-card guest-wifi-card" aria-labelledby="guest-wifi-title">
      <h2 className="guest-wifi-card__title" id="guest-wifi-title">
        WLAN Gastzugang
      </h2>
      <div className="guest-wifi-card__qr-space">
        <img
          className="guest-wifi-card__qr"
          src={guestWifiQrCode}
          width="141"
          height="141"
          alt="QR-Code für den WLAN-Gastzugang"
          draggable="false"
        />
      </div>
      <small>QR-Code scannen</small>
    </Card>
  )
}
