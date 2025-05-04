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

import TabloAPI from './tablo_api';
import Lighthouse from './lighthouse';
import type { Logo } from './types';
import Cache from '@gibme/cache/memory';

/**
 * See https://jessedp.github.io/tablo-api-docs/#tablo-api-introduction
 * for an extensive list of device endpoints
 *
 * Note: this implementation is currently incomplete and is unlikely to have all endpoints implemented.
 */
export class Tablo extends TabloAPI {
    private readonly cache = new Cache({ stdTTL: 10 * 60 * 1000 });
    private readonly session_channels = new Map<string, Tablo.Channel>();

    /**
     * Attempts to discover the Tablo devices on the network from which this API is made.
     * @param timeout
     */
    public static async discover (timeout = 2000): Promise<Lighthouse.Device[]> {
        return Lighthouse.listAvailableDevices(timeout);
    }

    /**
     * Returns the currently available airings
     *
     * Note: This method contains a loop that results in the method taking a bit of time to complete,
     * you may specify a progress callback to help report the progress to the caller.
     *
     * Repeated calls to this method are cached for approximately 10 minutes.
     *
     * @param all if true, will return all airings, otherwise will only return airings that are currently playing.
     * @param timeout
     * @param force_refresh if set to true, will force a refresh of the cache.
     * @param progress_callback
     */
    public async airings (
        all = false,
        timeout = this.timeout,
        force_refresh = false,
        progress_callback?: (total: number, received: number) => void
    ): Promise<Tablo.Airing[]> {
        const progress = (total: number, received: number) => {
            if (progress_callback) {
                progress_callback(total, received);
            }
        };

        const { now, start } = this.currentHour;

        try {
            const result: Tablo.Airing[] = !force_refresh ? await this.cache.get('airings') ?? [] : [];

            if (result.length === 0) {
                let airings = await this.get<string[]>('/guide/airings', undefined, timeout) ?? [];

                const total = airings.length;

                progress(total, result.length);

                while (airings.length > 0) {
                    const batch = airings.slice(0, 50);
                    airings = airings.slice(50);

                    const data = await this.batch<Tablo.Batched.Airing>(batch, timeout);

                    result.push(...Object.entries(data)
                        .map(([, response]) => {
                            return {
                                show_title: response.airing_details.show_title,
                                start_time: new Date(response.airing_details.datetime),
                                end_time: new Date(this.calculate_endtime(
                                    response.airing_details.datetime,
                                    response.airing_details.duration)),
                                duration: response.airing_details.duration,
                                episode: {
                                    ...response.episode,
                                    orig_air_date: new Date(response.episode.orig_air_date)
                                },
                                channel: {
                                    ...response.airing_details.channel.channel
                                }
                            };
                        }));

                    progress(total, result.length);
                }

                await this.cache.set('airings', result);
            } else {
                progress(result.length, result.length);
            }

            return result.filter(airing => {
                if (all) {
                    return true;
                }

                const start_time = new Date(airing.start_time).getTime();
                const end_time = new Date(airing.end_time).getTime();

                return start_time >= start && start_time < now && end_time > now;
            }).sort((a, b) => {
                return (a.channel.major + (a.channel.minor * 0.1)) - (b.channel.major + (b.channel.minor * 0.1));
            });
        } catch (error: any) {
            return [];
        }
    }

    /**
     * Retrieves account subscription information from the device
     * @param timeout
     */
    public async accountSubscription (timeout = this.timeout): Promise<Tablo.AccountSubscription | undefined> {
        try {
            const response = await this.get<Tablo.AccountSubscription<string>>(
                '/account/subscription', undefined, timeout);

            if (response) {
                return {
                    ...response,
                    subscriptions: response.subscriptions.map(subscription => {
                        return {
                            ...subscription,
                            expires: subscription.expires ? new Date(subscription.expires) : null
                        };
                    })
                };
            }
        } catch {
        }
    }

    /**
     * Retrieves the capabilities of the device.
     * @param timeout
     */
    public async capabilities (timeout = this.timeout): Promise<string[]> {
        try {
            const response = await this.get<{ capabilities: string[] }>(
                '/server/capabilities', undefined, timeout);

            return response?.capabilities ?? [];
        } catch {
            return [];
        }
    }

    public async channel (channel_id: string, timeout = this.timeout): Promise<Tablo.Channel | undefined> {
        const channels = await this.channels(timeout);

        return channels.find(elem => elem.channel_identifier === channel_id);
    }

    /**
     * Returns a list of the available channels on the device.
     * @param timeout
     */
    public async channels (timeout = this.timeout): Promise<Tablo.Channel[]> {
        try {
            const channels = await this.get<string[]>('/guide/channels') ?? [];

            if (channels.length === 0) {
                return [];
            }

            const channel_data = await this.batch<Tablo.Batched.Channel>(channels, timeout);

            return Object.entries(channel_data)
                .map(([, response]) => {
                    return {
                        ...response.channel
                    };
                })
                .sort((a, b) => {
                    return (a.major + (a.minor * 0.1)) - (b.major + (b.minor * 0.1));
                });
        } catch {
            return [];
        }
    }

    /**
     * Retrieves information regarding the latest (or a specified) channel scan.
     *
     * @param scan_idx if not specified, will pull the latest channel scan information
     * @param timeout
     */
    public async channelScanInfo (
        scan_idx?: number | string,
        timeout = this.timeout
    ): Promise<Tablo.ChannelScan | undefined> {
        try {
            if (!scan_idx) {
                const response = await this.get<{ committed_scan: string; }>(
                    '/channels/info', undefined, timeout);

                if (response?.committed_scan) {
                    const [, , , scan_idx] = response.committed_scan.split('/');

                    return this.channelScanInfo(scan_idx, timeout);
                }
            } else {
                const response = await this.get<Tablo.ChannelScan<string>>(
                    `/channels/scans/${scan_idx}`);

                if (response) {
                    return {
                        ...response,
                        datetime: new Date(response.datetime)
                    };
                }
            }
        } catch {
        }
    }

    /**
     * Deletes/stops an existing watch (streaming) session
     * @param tokenOrPlayerSession
     * @param timeout
     */
    public async deleteSession (
        tokenOrPlayerSession: string | Tablo.PlayerSession,
        timeout = this.timeout
    ): Promise<boolean> {
        const token = typeof tokenOrPlayerSession === 'string' ? tokenOrPlayerSession : tokenOrPlayerSession.token;

        try {
            const success = await this.delete(`/player/sessions/${token}`, { lh: undefined }, timeout);

            if (success) {
                this.session_channels.delete(token);
            }

            return success;
        } catch {
            return false;
        }
    }

    /**
     * Retrieves device subscription information.
     * @param timeout
     */
    public async deviceSubscription (timeout = this.timeout): Promise<Tablo.DeviceSubscription | undefined> {
        try {
            const response = await this.get<Tablo.DeviceSubscription<string>>(
                '/server/subscription', undefined, timeout);

            if (response) {
                return {
                    ...response,
                    expires: response.expires ? new Date(response.expires) : null
                };
            }
        } catch {
        }
    }

    /**
     * Retrieves the guide status from the device
     * @param timeout
     */
    public async guideStatus (timeout = this.timeout): Promise<Tablo.GuideStatus | undefined> {
        try {
            const response = await this.get<Tablo.GuideStatus<string>>(
                '/server/guide/status', undefined, timeout);

            if (response) {
                return {
                    ...response,
                    last_update: new Date(response.last_update),
                    limit: new Date(response.limit)
                };
            }
        } catch {
        }
    }

    /**
     * Retrieves a list of the hard drives connected to the device.
     * @param timeout
     */
    public async hardDrives (timeout = this.timeout): Promise<Tablo.HardDrive[]> {
        try {
            return (await this.get('/server/harddrives', undefined, timeout) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Retrieves device information
     * @param timeout
     */
    public async info (timeout = this.timeout): Promise<Tablo.Info | undefined> {
        try {
            return await this.get('/server/info', undefined, timeout);
        } catch {
        }
    }

    /**
     * Sends a watch (streaming) session keepalive request so that the session does not time out and stop
     * @param tokenOrPlayerSession
     * @param timeout
     */
    public async keepaliveSession (
        tokenOrPlayerSession: string | Tablo.PlayerSession,
        timeout = this.timeout
    ): Promise<Tablo.PlayerSession | undefined> {
        const token = typeof tokenOrPlayerSession === 'string' ? tokenOrPlayerSession : tokenOrPlayerSession.token;

        try {
            const channel = this.session_channels.get(token);

            const response = await this.post(
                `/player/sessions/${token}/keepalive`,
                { lh: undefined },
                undefined,
                timeout);

            if (response) {
                return {
                    ...response,
                    channel
                };
            }
        } catch {
        }
    }

    /**
     * Retrieves device location information
     * @param timeout
     */
    public async location (timeout = this.timeout): Promise<Tablo.Location | undefined> {
        try {
            return await this.get('/server/location', undefined, timeout);
        } catch {
        }
    }

    /**
     * Attempts to retrieve an existing watch (streaming) session
     * @param tokenOrPlayerSession
     * @param timeout
     */
    public async session (
        tokenOrPlayerSession: string | Tablo.PlayerSession,
        timeout = this.timeout
    ): Promise<Tablo.PlayerSession | undefined> {
        const token = typeof tokenOrPlayerSession === 'string' ? tokenOrPlayerSession : tokenOrPlayerSession.token;

        try {
            const channel = this.session_channels.get(token);

            const response = await this.get(`/player/sessions/${token}`, { lh: undefined }, timeout);

            if (response) {
                return {
                    ...response,
                    channel
                };
            }
        } catch {
        }
    }

    /**
     * Retrieves the settings of the device.
     * @param timeout
     */
    public async settings (timeout = this.timeout): Promise<Tablo.Settings | undefined> {
        try {
            return await this.get('/settings/info', undefined, timeout);
        } catch {
        }
    }

    /**
     * Retrieves the list of supported storage types.
     * @param timeout
     */
    public async storage (timeout = this.timeout): Promise<string[]> {
        try {
            const response = await this.get<{ supported_kinds: string[] }>(
                '/storage/info', undefined, timeout);

            return response?.supported_kinds ?? [];
        } catch {
            return [];
        }
    }

    /**
     * Retrieves tuner information of the device.
     * @param timeout
     */
    public async tuners (timeout = this.timeout): Promise<Tablo.Tuner[]> {
        try {
            // todo: resolve the channel property with actual information
            return (await this.get('/server/tuners', undefined, timeout) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Retrieves device update information.
     * @param timeout
     */
    public async updateInfo (timeout = this.timeout): Promise<Tablo.UpdateInfo | undefined> {
        try {
            const response = await this.get<Tablo.UpdateInfo<string>>(
                '/server/update/info', undefined, timeout);

            if (response) {
                return {
                    ...response,
                    last_checked: new Date(response.last_checked),
                    last_update: response.last_update ? new Date(response.last_update) : null
                };
            }
        } catch {
        }
    }

    /**
     * Retrieves device update progress information.
     * @param timeout
     */
    public async updateProgress (timeout = this.timeout): Promise<unknown | undefined> {
        try {
            return await this.get('/server/update/progress', undefined, timeout);
        } catch {
        }
    }

    /**
     * Initiates a channel watch (streaming) session on the device which must be managed via
     * `keepaliveSession` and `deleteSession`
     * @param channel_id
     * @param device_info
     * @param timeout
     */
    public async watchChannel (
        channel_id: string,
        device_info: Partial<Tablo.Client.Device> = {},
        timeout = 30000
    ): Promise<Tablo.PlayerSession | undefined> {
        device_info.device_id ??= this.device_id;
        device_info.platform ??= 'ios';
        device_info.bandwidth ??= null;
        device_info.extra ??= {};
        device_info.extra.deviceId ??= '00000000-0000-0000-0000-000000000000';
        device_info.extra.width ??= 640;
        device_info.extra.height ??= 480;
        device_info.extra.deviceModel ??= 'iPhone15,3';
        device_info.extra.lang ??= 'en_US';
        device_info.extra.deviceOS ??= 'iOS';
        device_info.extra.deviceOSVersion ??= '18.4.1';
        device_info.extra.limitedAdTracking ??= 1;
        device_info.extra.deviceMake ??= 'Apple';

        const info = await this.info();

        const channel = await this.channel(channel_id);

        if (info && channel) {
            try {
                const response = await this.post<Tablo.PlayerSession<string>>(
                    `/guide/channels/${channel_id}/watch`,
                    { lh: undefined },
                    device_info,
                    timeout);

                if (response) {
                    this.session_channels.set(response.token, channel);

                    return {
                        ...response,
                        expires: new Date(response.expires),
                        channel
                    };
                }
            } catch {
            }
        }
    }
}

export namespace Tablo {
    export namespace Client {
        type DeviceExtra = {
            deviceOS: string;
            deviceId: string;
            width: number;
            deviceModel: string;
            lang: string;
            height: number;
            deviceOSVersion: string;
            limitedAdTracking: number;
            deviceMake: string;
        }

        export type Device = {
            device_id: string;
            extra: Partial<DeviceExtra>;
            platform: string;
            bandwidth: unknown;
        }
    }

    export type Info = {
        server_id: string;
        name: string;
        timezone: string;
        deprecated: string;
        version: string;
        local_address: string;
        setup_completed: boolean;
        build_number: number;
        model: {
            wifi: boolean;
            tuners: number;
            type: string;
            name: string;
        };
        availability: string;
        cache_key: string;
        product: string;
    }

    export type Location = {
        state: string;
        location: {
            postal_code: string;
            name: string;
            locality: string;
            area: string;
            state: string;
            latitude: number;
            longitude: number;
        };
        timezone: {
            name: string;
            raw_offset: number;
            dst_offset: number;
            does_dst: boolean;
        }
    }

    export type Tuner = {
        in_use: boolean;
        channel: string | null;
        recording: string | null;
        channel_identifier: string | null;
    }

    export type Settings = {
        led: string;
        extended_live_recordings: boolean;
        auto_delete_recordings: boolean;
        exclude_duplicates: boolean;
        preferred_audio_track: string;
        data_collection: boolean;
        enable_amplifier: boolean;
    }

    export type Channel = {
        call_sign: string;
        name: string;
        call_sign_src: string;
        major: number;
        minor: number;
        network: string;
        flags: string[];
        resolution: string;
        favourite: boolean;
        tms_station_id: string;
        tms_affiliate_id: string;
        channel_identifier: string;
        source: string;
        logos: Logo[];
    }

    export type PlayerSession<DateType = Date> = {
        token: string;
        expires: DateType;
        keepalive: number;
        playlist_url: string;
        video_details: {
            container_format: string;
            flags: string[];
        };
        channel: Channel;
    }

    export type HardDrive = {
        error: unknown | null;
        connected: boolean;
        format_state: string;
        name: string;
        busy_state: string;
        kind: string;
        size: number;
        size_mib: number;
        usage: number;
        usage_mib: number;
        free: number;
        free_mib: number;
        limit: number;
        limit_mib: number;
    }

    export type GuideStatus<DateType = Date> = {
        guide_seeded: boolean;
        last_update: DateType;
        limit: DateType;
        download_progress: number | null;
    }

    export type DeviceSubscription<DateType = Date> = {
        state: string;
        expires: DateType | null;
        url: string;
        identifier: string;
    }

    type Subscription<DateType = Date> = {
        kind: string;
        state: string;
        name: string;
        title: string;
        deprecated: string;
        expires: DateType | null;
        registration_url: string;
        registration_identifier: string;
        subtitle: string;
        description: string;
        actions: any[];
        warnings: any[];
    }

    export type AccountSubscription<DateType = Date> = {
        services: {
            guide_data: { selected: boolean; active: boolean };
            cloud_dvr: unknown | null;
            deprecated: string;
        };
        state: string;
        trial: unknown | null;
        offered_option: unknown | null;
        registration: {
            url: string;
            identifier: string;
        };
        subscriptions: Subscription<DateType>[];
    }

    export type UpdateInfo<DateType = Date> = {
        details: unknown | null;
        available_update: unknown | null;
        last_checked: DateType;
        last_update: DateType | null;
        sequence: string[];
        current_step: unknown | null;
        state: string;
        error: unknown | null;
    }

    export type ChannelScan<DateType = Date> = {
        object_id: string;
        path: string;
        postal_code: string;
        datetime: DateType;
        completed: boolean;
        progress: number;
        preferred_audio_track: string;
    }

    export type Episode<DateType = Date> = {
        title: string;
        description: string;
        number: number;
        season_number: number;
        orig_air_date: DateType;
        tms_id: string;
    };

    export type Airing<DateType = Date> = {
        show_title: string;
        start_time: DateType;
        end_time: DateType;
        duration: number;
        episode: Episode<DateType>;
        channel: Channel;
    }

    export namespace Batched {
        export type Root = {
            object_id: number;
            path: string;
        }

        export type Channel = {
            channel: Tablo.Channel;
        }

        export type Airing = {
            series_path: string;
            season_path: string;
            episode: Episode<string>;
            airing_details: {
                show_title: string;
                datetime: string;
                duration: number;
                channel_path: string;
                channel: Root & Channel;
            };
            qualifiers: string[];
            schedule: {
                state: string;
                qualifier: string;
                skip_reason: string;
                skip_detail: unknown | null;
                offsets: { start: number; end: number; source: string; }
            }
        }
    }
}

export default Tablo;
