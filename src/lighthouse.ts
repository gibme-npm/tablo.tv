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

import fetch from '@gibme/fetch';
import Logger from '@gibme/logger';
import { Logo } from './types';

type Token = {
    access_token: string;
    token_type: string;
    is_verified: boolean;
}

export class Lighthouse {
    private static readonly base_uri = 'https://lighthousetv.ewscloud.com/api/v2';
    private token?: Token;
    private context_token: string = '';

    // eslint-disable-next-line no-useless-constructor
    constructor (
        private readonly email: string,
        private readonly password: string,
        public readonly timeout = 2000,
        private readonly request_logging = false
    ) {
    }

    public get authenticated (): boolean {
        return !!this.token;
    }

    private get base_uri (): string {
        return Lighthouse.base_uri;
    }

    public static async execute<ResponseType = any> (
        method: string,
        endpoint: string,
        params: Record<string, any> = {},
        payload?: Record<string, any> | string,
        timeout = 2000
    ): Promise<ResponseType> {
        const qs = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            qs.set(key, value);
        }

        const url = endpoint.includes('://')
            ? `${endpoint}?${qs.toString()}`
            : `${this.base_uri}${endpoint}?${qs.toString()}`;

        const response = await fetch(url, {
            json: (method === 'PATCH' || method === 'POST' || method === 'PUT') ? payload : undefined,
            method,
            timeout
        });

        if (!response.ok) {
            throw new Error(`${response.url} [${response.status}] ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Retrieves a list of devices associated with the network from which this API call is made.
     * @param timeout
     */
    public static async listAvailableDevices (timeout = 2000): Promise<Lighthouse.Device[]> {
        try {
            return (await this.get('/devices/', undefined, timeout) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Retrieves a list of virtual devices associated with the network from which this API call is made.
     * @param timeout
     */
    public static async listVirtualDevices (timeout = 2000): Promise<Lighthouse.Device[]> {
        try {
            return (await this.get('/devices/virtual/', undefined, timeout) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Attempts to retrieve the specified virtual device associated with the network from which this API call is made.
     * @param server_id
     * @param timeout
     */
    public static async virtualDevice (
        server_id: string,
        timeout = 2000
    ): Promise<Lighthouse.Device | undefined> {
        try {
            return await this.get(`/devices/virtual/${server_id}/`, undefined, timeout);
        } catch {
        }
    }

    private static async get<ResponseType = any> (
        endpoint: string,
        params: Record<string, any> = {},
        timeout = 2000
    ): Promise<ResponseType> {
        return this.execute('GET', endpoint, params, undefined, timeout);
    }

    /**
     * Retrieves the account information
     */
    public async accountInfo (timeout = this.timeout): Promise<Lighthouse.AccountInfo | undefined> {
        try {
            return await this.get('/account/', undefined, timeout);
        } catch {
        }
    }

    /**
     * Retrieves the current airing information for the specified channel within the specified device context
     * @param channel_id
     * @param context_token
     * @param timeout
     */
    public async channelAirings (
        channel_id: string,
        context_token: string = this.context_token,
        timeout = this.timeout
    ): Promise<Lighthouse.GuideAiring[]> {
        try {
            return (await this.get(`/account/guide/channels/${channel_id}/live/`,
                undefined,
                timeout,
                context_token) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Retrieves the list of live airings for the specified device context
     * @param context_token
     * @param timeout
     */
    public async currentLiveAirings (
        context_token: string = this.context_token,
        timeout = this.timeout
    ): Promise<Lighthouse.LiveAiring[]> {
        try {
            return (await this.get(
                `/account/${context_token}/guide/channels/live/`,
                undefined,
                timeout,
                context_token) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Retrieves a list of the devices associated with the account
     */
    public async devices (timeout = this.timeout): Promise<Lighthouse.Device[]> {
        try {
            return (await this.get('/account/devices/', undefined, timeout) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Retrieves the list of channels available within the specified device context
     * @param context_token
     * @param timeout
     */
    public async guideChannels (
        context_token: string = this.context_token,
        timeout = this.timeout
    ): Promise<Lighthouse.GuideChannel[]> {
        try {
            return (await this.get(
                `/account/${context_token}/guide/channels/`,
                undefined,
                timeout,
                context_token) ?? []);
        } catch {
            return [];
        }
    }

    /**
     * Attempts to retrieve information regarding a specific device associated with the account
     * @param server_id
     * @param timeout
     */
    public async resolveDevice (server_id: string, timeout = this.timeout): Promise<Lighthouse.Device | undefined> {
        try {
            return await this.get(`/account/devices/${server_id}/resolve/`, undefined, timeout);
        } catch {
        }
    }

    /**
     * Selects the device context based upon the specified `profile_id` and `server_id`.
     * @param profile_id
     * @param server_id
     * @param timeout
     */
    public async selectDeviceContext (
        profile_id: string,
        server_id: string,
        timeout = this.timeout
    ): Promise<string | undefined> {
        try {
            const { token } = await this.post('/account/select/', {
                pid: profile_id,
                sid: server_id
            }, timeout);

            if (token) {
                this.context_token = token;
            }

            return token;
        } catch {
        }
    }

    protected async get<ResponseType = any> (
        endpoint: string,
        params: Record<string, any> = {},
        timeout = this.timeout,
        token?: string
    ): Promise<ResponseType> {
        return this.execute('GET', endpoint, params, undefined, timeout, token);
    }

    protected async post<ResponseType = any> (
        endpoint: string,
        payload?: object,
        timeout = this.timeout,
        token?: string
    ): Promise<ResponseType> {
        return this.execute('POST', endpoint, {}, payload, timeout, token);
    }

    private async authenticate (timeout = this.timeout): Promise<boolean> {
        try {
            const response = await fetch(`${this.base_uri}/login/`, {
                method: 'POST',
                json: {
                    email: this.email,
                    password: this.password
                },
                timeout
            });

            if (response.ok) {
                this.token = await response.json();

                return true;
            }

            delete this.token;

            return false;
        } catch {
            return false;
        }
    }

    private async execute<ResponseType = any> (
        method: string,
        endpoint: string,
        params: Record<string, any> = {},
        payload?: Record<string, any> | string,
        timeout = this.timeout,
        token?: string,
        is_retry = false
    ): Promise<ResponseType> {
        if (!this.token && !await this.authenticate(timeout)) {
            throw new Error('Failed to authenticate with Lighthouse API');
        }

        const headers: Record<string, string> = {
            Accept: 'application/json',
            Authorization: `${this.token?.token_type} ${this.token?.access_token}`
        };

        if (token) {
            headers.Lighthouse = token;
        }

        const qs = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            qs.set(key, value);
        }

        const url = endpoint.includes('://')
            ? `${endpoint}?${qs.toString()}`
            : `${this.base_uri}${endpoint}?${qs.toString()}`;

        if (this.request_logging) {
            Logger.debug(
                '%s %s %s %s',
                method,
                JSON.stringify(headers),
                url,
                payload ? JSON.stringify(payload) : ''
            );
        }

        const response = await fetch(url, {
            headers,
            json: (method === 'PATCH' || method === 'POST' || method === 'PUT') ? payload : undefined,
            method
        });

        if (!response.ok) {
            if (response.status === 401 && !is_retry) {
                if (await this.authenticate(timeout)) {
                    return this.execute(method, endpoint, params, payload, timeout, token, true);
                }
            }

            throw new Error(`${response.url} [${response.status}] ${response.statusText}`);
        }

        return await response.json();
    }
}

export namespace Lighthouse {
    export type Device = {
        serverId: string;
        name: string;
        type: string;
        product: string;
        version: string;
        buildNumber: number;
        registrationStatus: string;
        lastSeen: string;
        reachability: string;
        url: string;
    }

    export type Profile = {
        identifier: string;
        name: string;
        date_joined: string;
        preferences: Record<string, any>;
    }

    export type AccountInfo = {
        identifier: string;
        is_verified: boolean;
        email: string;
        firstName: string;
        lastName: string;
        postalCode: string;
        dma: string;
        devices: Device[];
        profiles: Profile[];
    }

    type OTA = {
        major: number;
        minor: number;
        callsign: string;
        network: string;
    }

    export type GuideChannel = {
        identifier: string;
        name: string;
        kind: string;
        logos: Logo[];
        ota: OTA;
    }

    export type GuideAiring = {
        identifier: string;
        title: string;
        channel: { identifier: string; };
        datetime: string;
        onnow: string;
        description: string;
        kind: string;
        qualifiers: number;
        genres: string[];
        images: Logo[];
        duration: number;
        show: {
            identifier: string;
            title: string;
            sortTitle: string;
            sectionTitle: string;
        };
        episode: {
            season: { kind: string; number: number; };
            episodeNumber: number;
            originalAirDate: string;
            rating: string;
        }
    }

    export type LiveAiring = {
        channel: GuideChannel;
        airing: GuideAiring;
    }
}

export default Lighthouse;
