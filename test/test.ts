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

import { describe, it } from 'mocha';
import Tablo, { Lighthouse, LiveTranscoder } from '../src';
import assert from 'assert';
import { config } from 'dotenv';

config();

const PULL_AIRINGS = process.env.PULL_AIRINGS === 'true' || process.env.PULL_AIRINGS === '1';

describe('Unit Tests', () => {
    let devices: Lighthouse.Device[] = [];
    let virtuals: Lighthouse.Device[] = [];

    describe('Lighthouse API', () => {
        describe('Static Methods', async () => {
            it('List Available Devices', async () => {
                devices = await Lighthouse.listAvailableDevices();

                assert(Array.isArray(devices), 'devices is not an array');
            });

            it('List Virtual Devices', async () => {
                virtuals = await Lighthouse.listVirtualDevices();

                assert(Array.isArray(virtuals), 'virtual is not an array');
            });

            it('Virtual Device', async function () {
                if (virtuals.length === 0) {
                    return this.skip();
                }

                const device = await Lighthouse.virtualDevice(virtuals[0].serverId);

                if (!device) {
                    assert.fail('device is undefined');
                }

                assert.equal(device.serverId, virtuals[0].serverId, 'serverId is not equal');
            });
        });

        describe('Instance Methods', async () => {
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

            it('Account Info', async function () {
                if (!has_credentials()) {
                    return this.skip();
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

            it('List Devices', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const received_devices = await api.devices();

                assert(Array.isArray(received_devices), 'devices is not an array');
                assert(received_devices.length > 0, 'devices is empty');
            });

            it('Resolve Device', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const device = await api.resolveDevice(server_id);

                if (!device) {
                    assert.fail('device is undefined');
                }

                assert.equal(device.serverId, server_id, 'serverId is not equal');
            });

            it('Select Device Context', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const received_context = await api.selectDeviceContext(profile_id, server_id);

                if (!received_context) {
                    assert.fail('context is undefined');
                }

                context = received_context;
            });

            it('List Guide Channels', async function () {
                if (!is_ready_context()) {
                    return this.skip();
                }

                channels = await api.guideChannels(context);

                assert(Array.isArray(channels), 'channels is not an array');
                assert(channels.length > 0, 'channels is empty');
            });

            it('List Current Live Airings', async function () {
                if (!is_ready_context()) {
                    return this.skip();
                }

                const airings = await api.currentLiveAirings(context);

                assert(Array.isArray(airings), 'airings is not an array');
                assert(airings.length > 0, 'airings is empty');
            });

            it('Get Channel Airings', async function () {
                if (!is_ready_context()) {
                    return this.skip();
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

                    break;
                }
            }
        });

        describe('General Methods', async () => {
            it('Device Information', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const info = await api.info();

                assert(info, 'info is undefined');
            });

            it('Settings', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const settings = await api.settings();

                assert(settings, 'settings is undefined');
            });

            it('Storage', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const storage = await api.storage();

                assert(storage, 'storage is undefined');
            });

            it('Tuners', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const tuners = await api.tuners();

                assert(tuners, 'tuners is undefined');
            });

            it('Hard Drives', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const drives = await api.hardDrives();

                assert(Array.isArray(drives), 'drives is not an array');
                assert(drives.length > 0, 'drives is empty');
            });

            it('Location', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const location = await api.location();

                assert(location, 'location is undefined');
            });

            it('Device Subscription', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const subscription = await api.deviceSubscription();

                assert(subscription, 'subscription is undefined');
            });

            it('Account Subscription', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const subscription = await api.accountSubscription();

                assert(subscription, 'subscription is undefined');
            });

            it('Capabilities', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const capabilities = await api.capabilities();

                assert(Array.isArray(capabilities), 'capabilities is not an array');
                assert(capabilities.length > 0, 'capabilities is empty');
            });
        });

        describe('Updates', async () => {
            it('Update Information', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const update = await api.updateInfo();

                assert(update, 'update is undefined');
            });

            it('Update Progress', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                await api.updateProgress();

                // unsure how to test yet
            });
        });

        describe('Channels', async () => {
            let scan_idx: number | string = 0;

            it('Channel Scan Information', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const scan = await api.channelScanInfo();

                assert(scan, 'scan is undefined');

                scan_idx = scan.object_id;
            });

            it('Channel Scan Information (with scan_idx)', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const scan = await api.channelScanInfo(scan_idx);

                assert(scan, 'scan is undefined');
            });

            it('Channels', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                channels = await api.channels();

                assert(Array.isArray(channels), 'channels is not an array');
                assert(channels.length > 0, 'channels is empty');
            });

            it('Channel', async function () {
                if (!is_ready_channels()) {
                    return this.skip();
                }

                const channel = await api.channel(channels[0].channel_identifier);

                assert(channel, 'channel is undefined');
            });

            it('Guide Status', async function () {
                if (!is_ready()) {
                    return this.skip();
                }

                const info = await api.guideStatus();

                assert(info, 'info is undefined');
            });

            it('Airings - All', async function () {
                if (!PULL_AIRINGS) {
                    return this.skip();
                }

                if (!is_ready()) {
                    return this.skip();
                }

                const airings = await api.airings(true, undefined, undefined, (total, received) => {
                    console.log(`Received: ${received}, Total: ${total}`);
                });

                assert(Array.isArray(airings), 'airings is not an array');
                assert(airings.length > 0, 'airings is empty');
            });

            it('Airings - Filtered', async function () {
                if (!PULL_AIRINGS) {
                    return this.skip();
                }

                if (!is_ready()) {
                    return this.skip();
                }

                const airings = await api.airings(false, undefined, undefined, (total, received) => {
                    console.log(`Received: ${received}, Total: ${total}`);
                });

                assert(Array.isArray(airings), 'airings is not an array');
                assert(airings.length > 0, 'airings is empty');
            });
        });

        describe('Watch Sessions', async () => {
            describe('Session Management', async () => {
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

                it('Watch Channel', async function () {
                    if (!is_ready_channels()) {
                        return this.skip();
                    }

                    session = await api.watchChannel(channels[0].channel_identifier);

                    if (!session) {
                        return this.skip();
                    }

                    assert(session, 'session is undefined');
                });

                it('Get Session', async function () {
                    if (!is_ready_session()) {
                        return this.skip();
                    }

                    if (!session) {
                        assert.fail('session is undefined');
                    }

                    const received_session = await api.session(session);

                    assert.deepEqual(comparable_session(received_session), comparable_session(session),
                        'sessions are not equal');
                });

                it('Keepalive Session', async function () {
                    if (!is_ready_session()) {
                        return this.skip();
                    }

                    if (!session) {
                        assert.fail('session is undefined');
                    }

                    const received_session = await api.keepaliveSession(session);

                    assert.deepEqual(comparable_session(received_session), comparable_session(session),
                        'sessions are not equal');
                });

                it('Delete Session', async function () {
                    if (!is_ready_session()) {
                        return this.skip();
                    }

                    if (!session) {
                        assert.fail('session is undefined');
                    }

                    const success = await api.deleteSession(session);

                    assert(success, 'delete session failed');
                });
            });

            describe('Live Transcoding', async () => {
                let transcoder: LiveTranscoder | undefined;

                before(async () => {
                    try {
                        transcoder = await LiveTranscoder.instance(api, channels[0].channel_identifier, './streams');
                    } catch {}
                });

                it('Start Live Transcoding', async function () {
                    // eslint-disable-next-line @typescript-eslint/no-this-alias
                    const $this = this;

                    if (!is_ready_channels() || !transcoder) {
                        return this.skip();
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

                    return run().catch(() => $this.skip());
                });

                it('Stop Live Transcoding', async function () {
                    if (!transcoder?.active) {
                        return this.skip();
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
