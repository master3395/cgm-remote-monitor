# Ypsomed ecosystem (YpsoPump, CamAPS, AAPS, Companion)

Nightscout shows glucose, pump, loop, and IOB only when an uploader sends the right data. With **YpsoPump + Libre 3+ + CamAPS FX**, a single xDrip+ install usually uploads **CGM only**.

## What each app can upload

| App | Real-time CGM | Pump / reservoir | Loop / temp basal | IOB / treatments |
|-----|---------------|------------------|-------------------|------------------|
| **xDrip+** (Nightscout Sync) | Yes (Libre 3+) | No | No | No |
| **CamAPS FX** | Via xDrip or Glooko | Via Glooko (delayed) | Via Glooko (delayed) | Via Glooko (delayed) |
| **CamAPS Companion** | Follower UI | No upload to NS | No upload to NS | No upload to NS |
| **AndroidAPS** | Yes (if configured) | Yes | Yes | Yes |
| **nightscout-connect** (Glooko) | Yes (60–90+ min delay) | Yes | Yes | Yes |

CamAPS does **not** push loop/treatment data to Nightscout directly. Treatments sync to **Glooko** (formerly Diasend) on a throttled schedule.

## Recommended setups

### Setup A: Live CGM only (simplest)

1. xDrip+ → **Settings → Cloud Upload → Nightscout Sync**
2. Base URL: `https://YOUR_API_SECRET@your-nightscout-host/api/v1/`
3. Enable plugins: `xdripjs`, `ecosystem`, `iob`, `pump`, `loop`, `openaps`

You will see glucose and the **Apps** pill (`CGM·Loop-·Pump-`). Pump/Loop/IOB pills stay empty until another uploader is added.

### Setup B: Full loop + pump via AndroidAPS

If you run **AndroidAPS** with YpsoPump (supported configurations only):

1. AAPS → **Config → NSClient** → same Nightscout URL and API secret
2. Enable **Upload treatments**, **Device status**, **OpenAPS**, **Pump**
3. Keep xDrip+ for CGM if AAPS does not source Libre directly

Nightscout `pump`, `loop`, `openaps`, and `iob` plugins will populate from AAPS `devicestatus`.

### Setup C: CamAPS historical data via Glooko

For CamAPS users who need treatments and temp basals in Nightscout:

1. Keep xDrip+ for **live** CGM
2. Run [nightscout-connect](https://github.com/nightscout/nightscout-connect) against your **Glooko** account
3. Point connect at the same Nightscout site

Expect **60–90+ minute delay** for pump/loop/treatment data from Glooko.

## Nightscout plugin: `ecosystem`

Add to `.env`:

```env
ENABLE="... ecosystem ..."
SHOW_PLUGINS="... ecosystem ..."
```

The **Apps** pill summarizes detected uploaders:

- **CGM** – xDrip+, Libre, or Glooko entries
- **Loop** – `loop` or `openaps` blocks (AAPS, some bridges)
- **Pump** – `pump` block in `devicestatus`

Tap the pill for setup tips when a channel is missing.

## Verify uploads

```bash
curl -s "https://your-site/api/v1/devicestatus.json?count=5" | jq '.[].device'
curl -s "https://your-site/api/v1/treatments.json?count=5" | jq '.[].eventType'
```

If `devicestatus` only contains `uploader` battery from xDrip, pump/loop pills cannot show data until AAPS or Glooko connect is configured.

## Branch for testing

This fork maintains `feature/ypsomed-ecosystem` for isolated testing of the ecosystem plugin before merging to `master`.
