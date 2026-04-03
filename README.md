# Tablo TV API Tooling

This package is not affiliated with or acting on behalf of Tablo TV.

## Documentation

[https://gibme-npm.github.io/tablo.tv](https://gibme-npm.github.io/tablo.tv)

## Requirements

- Node.js >= 22
- FFmpeg (for live transcoding features)

## Installation

```bash
yarn add @gibme/tablo.tv
# or
npm install @gibme/tablo.tv
```

## Quick Start

```typescript
import Tablo, { Lighthouse, LiveTranscoder } from '@gibme/tablo.tv';

// Discover devices on the local network
const devices = await Tablo.discover();

// Connect to a device (requires access/secret keys)
const tablo = new Tablo(devices[0].url, {
    access_key: 'your-access-key',
    secret_key: 'your-secret-key'
});

const info = await tablo.info();
console.log(`Connected to: ${info?.name} (v${info?.version})`);
```

> **Note:** The access key and secret key required to interact with a Tablo device are not included in this repository but are required to use the Device API.

## Features

### Lighthouse API (Cloud)

Static methods for unauthenticated device discovery and instance methods for authenticated account/guide operations. Handles OAuth token management with automatic retry on 401.

**Static Methods (no authentication required):**

| Method | Description |
|--------|-------------|
| `Lighthouse.listAvailableDevices()` | Discover Tablo devices on the network |
| `Lighthouse.listVirtualDevices()` | List virtual/cloud devices |
| `Lighthouse.virtualDevice(serverId)` | Get a specific virtual device |

**Instance Methods (requires email/password):**

```typescript
const lighthouse = new Lighthouse('email@example.com', 'password');
```

| Method | Description |
|--------|-------------|
| `accountInfo()` | Retrieve account information and profiles |
| `devices()` | List devices associated with the account |
| `resolveDevice(serverId)` | Get device details by server ID |
| `selectDeviceContext(profileId, serverId)` | Set device context for guide operations |
| `guideChannels(contextToken)` | List available guide channels |
| `currentLiveAirings(contextToken)` | List currently airing live programs |
| `channelAirings(channelId, contextToken)` | Get airings for a specific channel |

### Device API

Local device interaction using HMAC-MD5 signed requests. Provides access to device settings, channels, tuners, storage, airings, and watch sessions.

```typescript
const tablo = new Tablo('http://192.168.1.100:8887', {
    access_key: 'your-access-key',
    secret_key: 'your-secret-key'
});
```

**General:**

| Method | Description |
|--------|-------------|
| `info()` | Device information (name, model, version, etc.) |
| `settings()` | Device settings (LED, recording preferences, etc.) |
| `storage()` | Supported storage types |
| `tuners()` | Tuner status (in-use, current channel, recording) |
| `hardDrives()` | Connected hard drive info (size, usage, format state) |
| `location()` | Device location and timezone |
| `deviceSubscription()` | Device subscription state |
| `accountSubscription()` | Account subscription and service details |
| `capabilities()` | Device capability list |

**Channels & Guide:**

| Method | Description |
|--------|-------------|
| `channels()` | List all available channels |
| `channel(channelId)` | Get a single channel by identifier |
| `channelScanInfo(scanIdx?)` | Channel scan information |
| `guideStatus()` | Guide data status and last update |
| `airings(all?, timeout?, forceRefresh?, progressCallback?)` | Get airings (cached with 10-min TTL) |

**Updates:**

| Method | Description |
|--------|-------------|
| `updateInfo()` | Device firmware update information |
| `updateProgress()` | Current update progress |

**Watch Sessions:**

| Method | Description |
|--------|-------------|
| `watchChannel(channelId, deviceInfo?)` | Start a live watch session |
| `session(tokenOrSession)` | Retrieve an existing session |
| `keepaliveSession(tokenOrSession)` | Send keepalive to prevent timeout |
| `deleteSession(tokenOrSession)` | Stop a watch session |

### Live Transcoder

FFmpeg-based MPEG2 to H.264 transcoding with HLS output. Uses a singleton pattern per device/channel combination and supports multiple concurrent consumers via reference counting.

```typescript
// Create a transcoder instance (singleton per device + channel)
const transcoder = await LiveTranscoder.instance(tablo, channelId, './streams');

transcoder.on('ready', () => {
    console.log(`Stream available at: ${transcoder.full_path}`);
});

transcoder.on('error', (error) => {
    console.error('Transcoder error:', error.message);
});

transcoder.on('stopped', () => {
    console.log('Transcoder stopped');
});

// Start transcoding
await transcoder.start();

// Stop when done (decrements use count; only stops FFmpeg when no consumers remain)
transcoder.stop();
```

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | — | HLS output file is ready for streaming |
| `error` | `Error` | FFmpeg or session error occurred |
| `exit` | `number \| null` | FFmpeg process exited |
| `stopped` | — | Transcoder fully stopped and cleaned up |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `active` | `boolean` | Whether the transcoder is running |
| `use_count` | `number` | Number of concurrent consumers |
| `full_path` | `string` | Full path to the HLS playlist |
| `session` | `PlayerSession?` | Current streaming session |
| `channel` | `Channel?` | Current channel being transcoded |

## License

MIT
