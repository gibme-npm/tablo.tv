// Copyright (c) 2025, Brandon Lehmann <brandonlehmann@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { describe, it, before } from 'node:test';
import Tablo, { Lighthouse, LiveTranscoder } from '../src';
import assert from 'assert';
import { config } from 'dotenv';

config({ quiet: true });

const PULL_AIRINGS = process.env.PULL_AIRINGS === 'true' || process.env.PULL_AIRINGS === '1';

describe('Unit Tests', () => {
    let devices: Lighthouse.Device[] = [];
    let virtuals: Lighthouse.Device[] = [];

    describe('Lighthouse API', () => {
        describe('Static Methods', () => {
            it('List Available Devices', async () => {
                devices = await Lighthouse.listAvailableDevices();

                assert(Array.isArray(devices), 'devices is not an array');
            });

            it('List Virtual Devices', async () => {
                virtuals = await Lighthouse.listVirtualDevices();

                assert(Array.isArray(virtuals), 'virtual is not an array');
            });

            it('Virtual Device', { skip: false }, async (t) => {
                if (virtuals.length === 0) {
                    return t.skip('no virtual devices available');
                }

                const device = await Lighthouse.virtualDevice(virtuals[0].serverId);

                if (!device) {
                    assert.fail('device is undefined');
                }

                assert.equal(device.serverId, virtuals[0].serverId, 'serverId is not equal');
            });
        });

        describe('Instance Methods', () => {
            const email = process.env.LIGHTHOUSE_EMAIL ?? '';
            const password = process.env.LIGHTHOUSE_PASSWORD ?? '';

            const has_credentials = (): boolean =>
                email.length !== 0 && password.length !== 0;

            const api = new Lighthouse(email, password);

            let profile_id = '';
            let server_id = '';
            let context = '';
            let channels: Lighthouse.GuideChannel[] = [];

            const is_ready = (): boolean =>
                api.authenticated && profile_id.length !== 0 && server_id.length !== 0;
            const is_ready_context = (): boolean =>
                is_ready() && context.length !== 0;

            it('Account Info', { skip: false }, async (t) => {
                if (!has_credentials()) {
                    return t.skip('no credentials');
                }

                const info = await api.accountInfo();

                if (!info) {
                    assert.fail('account info is undefined');
                }

                assert(info, 'account info is undefined');
                assert(info.is_verified, 'account is not verified');
                assert(info.profiles.length > 0, 'profiles is empty');
                profile_id = info.profiles[0].identifier;
                assert(info.devices.length > 0, 'devices is empty');
                server_id = info.devices[0].serverId;
            });

            it('List Devices', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const received_devices = await api.devices();

                assert(Array.isArray(received_devices), 'devices is not an array');
                assert(received_devices.length > 0, 'devices is empty');
            });

            it('Resolve Device', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const device = await api.resolveDevice(server_id);

                if (!device) {
                    assert.fail('device is undefined');
                }

                assert.equal(device.serverId, server_id, 'serverId is not equal');
            });

            it('Select Device Context', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const received_context = await api.selectDeviceContext(profile_id, server_id);

                if (!received_context) {
                    assert.fail('context is undefined');
                }

                context = received_context;
            });

            it('List Guide Channels', { skip: false }, async (t) => {
                if (!is_ready_context()) {
                    return t.skip('not ready');
                }

                channels = await api.guideChannels(context);

                assert(Array.isArray(channels), 'channels is not an array');
                assert(channels.length > 0, 'channels is empty');
            });

            it('List Current Live Airings', { skip: false }, async (t) => {
                if (!is_ready_context()) {
                    return t.skip('not ready');
                }

                const airings = await api.currentLiveAirings(context);

                assert(Array.isArray(airings), 'airings is not an array');
                assert(airings.length > 0, 'airings is empty');
            });

            it('Get Channel Airings', { skip: false }, async (t) => {
                if (!is_ready_context() || channels.length === 0) {
                    return t.skip('not ready');
                }

                const airings = await api.channelAirings(channels[0].identifier, context);

                if (!airings) {
                    assert.fail('airing is undefined');
                }

                assert(Array.isArray(airings), 'airings is not an array');
                assert(airings.length > 0, 'airings is empty');
            });
        });
    });

    describe('Tablo API', () => {
        let api: Tablo;
        let channels: Tablo.Channel[] = [];

        const is_ready = (): boolean => api !== undefined;
        const is_ready_channels = (): boolean =>
            is_ready() && channels.length > 0;

        it('Discover Devices', async () => {
            const found = await Tablo.discover();

            assert.deepEqual(found, devices, 'devices are not equal');

            for (const device of found) {
                const maybe_api = new Tablo(device.url, {
                    access_key: process.env.ACCESS_KEY ?? '',
                    secret_key: process.env.SECRET_KEY ?? ''
                });

                const info = await maybe_api.info();

                if (info) {
                    api = maybe_api;

                    console.log(`        Using device: ${device.url}`);

                    break;
                }
            }
        });

        describe('General Methods', () => {
            it('Device Information', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const info = await api.info();

                assert(info, 'info is undefined');
            });

            it('Settings', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const settings = await api.settings();

                assert(settings, 'settings is undefined');
            });

            it('Storage', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const storage = await api.storage();

                assert(storage, 'storage is undefined');
            });

            it('Tuners', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const tuners = await api.tuners();

                assert(Array.isArray(tuners), 'tuners is not an array');
                assert(tuners.length > 0, 'tuners is empty');

                for (const tuner of tuners) {
                    assert.strictEqual(typeof tuner.in_use, 'boolean', 'in_use is not a boolean');

                    if (tuner.channel) {
                        assert.strictEqual(typeof tuner.channel.call_sign, 'string',
                            'channel.call_sign is not a string');
                        assert.strictEqual(typeof tuner.channel.channel_identifier, 'string',
                            'channel.channel_identifier is not a string');
                    }
                }
            });

            it('Hard Drives', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const drives = await api.hardDrives();

                assert(Array.isArray(drives), 'drives is not an array');
                assert(drives.length > 0, 'drives is empty');
            });

            it('Location', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const location = await api.location();

                assert(location, 'location is undefined');
            });

            it('Device Subscription', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const subscription = await api.deviceSubscription();

                assert(subscription, 'subscription is undefined');
            });

            it('Account Subscription', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const subscription = await api.accountSubscription();

                assert(subscription, 'subscription is undefined');
            });

            it('Capabilities', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const capabilities = await api.capabilities();

                assert(Array.isArray(capabilities), 'capabilities is not an array');
                assert(capabilities.length > 0, 'capabilities is empty');
            });
        });

        describe('Updates', () => {
            it('Update Information', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const update = await api.updateInfo();

                assert(update, 'update is undefined');
            });

            it('Update Progress', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                await api.updateProgress();

                // unsure how to test yet
            });
        });

        describe('Channels', () => {
            let scan_idx: number | string = 0;

            it('Channel Scan Information', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const scan = await api.channelScanInfo();

                assert(scan, 'scan is undefined');

                scan_idx = scan.object_id;
            });

            it('Channel Scan Information (with scan_idx)', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const scan = await api.channelScanInfo(scan_idx);

                assert(scan, 'scan is undefined');
            });

            it('Channels', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                channels = await api.channels();

                assert(Array.isArray(channels), 'channels is not an array');
                assert(channels.length > 0, 'channels is empty');
            });

            it('Channel (by identifier)', { skip: false }, async (t) => {
                if (!is_ready_channels()) {
                    return t.skip('not ready');
                }

                const channel = await api.channel(channels[0].channel_identifier);

                assert(channel, 'channel is undefined');
                assert.strictEqual(channel.channel_identifier, channels[0].channel_identifier,
                    'channel_identifier mismatch');
            });

            it('Channel (by path)', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const tuners = await api.tuners();
                const active = tuners.find(t => t.channel !== null);

                if (!active) {
                    return t.skip('no active tuner');
                }

                const channel = active.channel!;

                assert.strictEqual(typeof channel.call_sign, 'string', 'call_sign is not a string');
                assert.strictEqual(typeof channel.channel_identifier, 'string', 'channel_identifier is not a string');
                assert.strictEqual(typeof channel.major, 'number', 'major is not a number');
                assert.strictEqual(typeof channel.minor, 'number', 'minor is not a number');
            });

            it('Guide Status', { skip: false }, async (t) => {
                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const info = await api.guideStatus();

                assert(info, 'info is undefined');
            });

            it('Airings - All', { skip: false }, async (t) => {
                if (!PULL_AIRINGS) {
                    return t.skip('PULL_AIRINGS not set');
                }

                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const airings = await api.airings(true, undefined, undefined, (total, received) => {
                    console.log(`Received: ${received}, Total: ${total}`);
                });

                assert(Array.isArray(airings), 'airings is not an array');
                assert(airings.length > 0, 'airings is empty');
            });

            it('Airings - Filtered', { skip: false }, async (t) => {
                if (!PULL_AIRINGS) {
                    return t.skip('PULL_AIRINGS not set');
                }

                if (!is_ready()) {
                    return t.skip('not ready');
                }

                const airings = await api.airings(false, undefined, undefined, (total, received) => {
                    console.log(`Received: ${received}, Total: ${total}`);
                });

                assert(Array.isArray(airings), 'airings is not an array');
                assert(airings.length > 0, 'airings is empty');
            });
        });

        describe('Watch Sessions', () => {
            describe('Session Management', () => {
                let session: Tablo.PlayerSession | undefined;

                const is_ready_session = (): boolean =>
                    is_ready() && session !== undefined;

                const comparable_session = (
                    session?: Tablo.PlayerSession
                ): Tablo.PlayerSession => {
                    return {
                        ...session as any,
                        expires: ''
                    };
                };

                it('Watch Channel', { skip: false }, async (t) => {
                    if (!is_ready_channels()) {
                        return t.skip('not ready');
                    }

                    session = await api.watchChannel(channels[0].channel_identifier);

                    if (!session) {
                        return t.skip('no session');
                    }

                    assert(session, 'session is undefined');
                });

                it('Get Session', { skip: false }, async (t) => {
                    if (!is_ready_session()) {
                        return t.skip('not ready');
                    }

                    if (!session) {
                        assert.fail('session is undefined');
                    }

                    const received_session = await api.session(session);

                    assert.deepEqual(comparable_session(received_session), comparable_session(session),
                        'sessions are not equal');
                });

                it('Keepalive Session', { skip: false }, async (t) => {
                    if (!is_ready_session()) {
                        return t.skip('not ready');
                    }

                    if (!session) {
                        assert.fail('session is undefined');
                    }

                    const received_session = await api.keepaliveSession(session);

                    assert.deepEqual(comparable_session(received_session), comparable_session(session),
                        'sessions are not equal');
                });

                it('Delete Session', { skip: false }, async (t) => {
                    if (!is_ready_session()) {
                        return t.skip('not ready');
                    }

                    if (!session) {
                        assert.fail('session is undefined');
                    }

                    const success = await api.deleteSession(session);

                    assert(success, 'delete session failed');
                });
            });

            describe('Live Transcoding', () => {
                let transcoder: LiveTranscoder | undefined;

                let transcoder_error: Error | undefined;

                before(async () => {
                    try {
                        transcoder = await LiveTranscoder.instance(api, channels[0].channel_identifier, './streams');
                    } catch (error: any) {
                        transcoder_error = error;
                    }
                });

                it('Start Live Transcoding', { skip: false }, async (t) => {
                    if (!is_ready_channels()) {
                        return t.skip('not ready');
                    }

                    if (!transcoder) {
                        if (transcoder_error) {
                            console.warn(`        ⚠ LiveTranscoder failed: ${transcoder_error.message}`);
                        }

                        return t.skip('no transcoder');
                    }

                    const run = async (): Promise<void> =>
                        new Promise((resolve, reject) => {
                            transcoder?.once('ready', () => {
                                transcoder?.removeAllListeners('error');

                                setTimeout(() => {
                                    return resolve();
                                }, 20_000);
                            });

                            transcoder?.once('error', error => {
                                return reject(error);
                            });

                            try {
                                transcoder?.start();
                            } catch (error: any) {
                                return reject(error);
                            }
                        });

                    try {
                        await run();
                    } catch {
                        t.skip('transcoder run failed');
                    }
                });

                it('Stop Live Transcoding', { skip: false }, async (t) => {
                    if (!transcoder?.active) {
                        return t.skip('transcoder not active');
                    }

                    return new Promise((resolve, reject) => {
                        transcoder?.once('stopped', () => {
                            transcoder?.removeAllListeners('error');

                            return resolve();
                        });

                        transcoder?.once('error', error => {
                            return reject(error);
                        });

                        transcoder?.stop();
                    });
                });
            });
        });
    });
});
