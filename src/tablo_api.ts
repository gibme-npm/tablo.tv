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
import { v4 as uuid } from 'uuid';
import { createHash, createHmac } from 'crypto';
import type { Tablo } from './tablo';
import Logger from '@gibme/logger';

type Credentials = {
    access_key: string;
    secret_key: string;
}

export class TabloAPI {
    public readonly device_id: string;
    private readonly base_uri;
    private readonly keys: Credentials;
    public readonly timeout: number = 2000;

    /**
     * Constructs a new instance of the base API to interact with a Tablo device
     * @param hostOrUri
     * @param options
     */
    constructor (
        hostOrUri: string,
        private readonly options: Partial<TabloAPI.Options> & Credentials
    ) {
        this.options.ssl ??= false;
        this.options.device_id ??= uuid();
        this.options.timeout ??= 2000;
        this.options.request_logging ??= false;
        this.options.port ??= 8887;

        if (hostOrUri.includes('://')) {
            if (hostOrUri.endsWith('/')) {
                hostOrUri = hostOrUri.slice(0, -1);
            }

            this.base_uri = hostOrUri;
            this.options.ssl = this.base_uri.startsWith('https');
        } else {
            this.base_uri = `${this.options.ssl ? 'https' : 'http'}://${hostOrUri}:${this.options.port}`;
        }

        this.keys = {
            access_key: this.options.access_key,
            secret_key: this.options.secret_key
        };

        this.device_id = this.options.device_id;

        this.timeout = this.options.timeout;
    }

    /**
     * Calculates the end time based upon the specified start time and duration
     * @param start_time
     * @param duration
     * @protected
     */
    protected calculate_endtime (start_time: string, duration: number): string {
        const date = new Date(start_time).getTime();

        return new Date(date + (duration * 1000)).toISOString();
    }

    /**
     * Returns the current hour timestamps
     * @protected
     */
    protected get currentHour (): { now: number, start: number, end: number } {
        const now = Math.floor((new Date()).getTime() / 1000) * 1000;

        const start = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;

        const end = start + (60 * 60 * 1000);

        return { now, start, end };
    }

    /**
     * Batch operations are much faster than a bunch of single operations.
     * For example, instead of making 50 requests for the first 50 recordings
     * returned by Recordings - Get Airings, you can take those 50 paths
     * and make 1 request to /batch to receive all the same data.
     * @param endpoints
     * @param timeout
     * @protected
     */
    protected async batch<ResponseType = any> (
        endpoints: string[],
        timeout = this.timeout
    ): Promise<Record<string, Tablo.Batched.Root & ResponseType>> {
        try {
            return await this.post<ResponseType>('/batch', undefined, endpoints, timeout) ?? {};
        } catch {
            return {};
        }
    }

    /**
     * Performs a DELETE request against the Tablo device
     * @param endpoint
     * @param params
     * @param timeout
     * @protected
     */
    protected async delete (
        endpoint: string,
        params: Record<string, any> = {},
        timeout = this.timeout
    ): Promise<boolean> {
        const response = await this.execute(
            'DELETE',
            endpoint,
            params,
            undefined,
            undefined,
            timeout);

        return response.ok;
    }

    /**
     * Performs a GET request against the Tablo device
     * @param endpoint
     * @param params
     * @param timeout
     * @param json
     * @protected
     */
    protected async get<ResponseType = any> (
        endpoint: string,
        params: Record<string, any> = {},
        timeout = this.timeout,
        json = true
    ): Promise<ResponseType | undefined> {
        const response = await this.execute(
            'GET',
            endpoint,
            params,
            undefined,
            undefined,
            timeout);

        if (response.ok) {
            if (json) {
                return response.json();
            } else {
                return await response.text() as any;
            }
        }
    }

    /**
     * Performs a PUT request against the Tablo device
     * @param endpoint
     * @param params
     * @param payload
     * @param timeout
     * @param json
     * @protected
     */
    protected async post<ResponseType = any> (
        endpoint: string,
        params: Record<string, any> = {},
        payload?: object,
        timeout = this.timeout,
        json = true
    ): Promise<ResponseType | undefined> {
        const response = await this.execute(
            'POST',
            endpoint,
            params,
            payload,
            undefined,
            timeout);

        if (response.ok) {
            if (json) {
                return response.json();
            } else {
                return await response.text() as any;
            }
        }
    }

    /**
     * Executes an API call to the Tablo device
     * @param method
     * @param endpoint
     * @param params
     * @param payload
     * @param keys
     * @param timeout
     * @private
     */
    private async execute (
        method: string,
        endpoint: string,
        params: Record<string, any> = {},
        payload?: Record<string, any>,
        keys: Credentials = this.keys,
        timeout = this.timeout
    ): Promise<Response> {
        const headers = this.generateAuthHeader(
            method,
            endpoint,
            payload ? JSON.stringify(payload) : undefined,
            keys);

        const qs = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            qs.set(key, value ?? '');
        }

        let url = `${this.base_uri}${endpoint}`;

        if (Object.entries(params).length > 0) {
            url += `?${qs.toString()}`;
        }

        if (this.options.request_logging) {
            Logger.debug(
                '%s %s %s %s',
                method,
                JSON.stringify(headers),
                url,
                payload ? JSON.stringify(payload) : ''
            );
        }

        return fetch(url, {
            headers,
            json: (method === 'PATCH' || method === 'POST' || method === 'PUT') ? payload : undefined,
            method,
            timeout
        });
    }

    /**
     * Generates the authentication header required for some of the Tablo device API calls
     * @param method
     * @param path
     * @param body
     * @param keys
     * @private
     */
    private generateAuthHeader (
        method: string,
        path: string,
        body: string = '',
        keys: Credentials = this.keys
    ): Record<string, string> {
        const date = (new Date()).toUTCString();

        const body_hash = body
            ? createHash('md5')
                .update(body)
                .digest('hex')
            : '';

        const message = `${method}\n${path}\n${body_hash}\n${date}`;

        const hmac_signature = createHmac('md5', keys.secret_key)
            .update(message)
            .digest('hex')
            .toUpperCase();

        return {
            Authorization: `tablo:${keys.access_key}:${hmac_signature}`,
            Date: date
        };
    }
}

export namespace TabloAPI {
    export type Options = {
        ssl: boolean;
        device_id: string;
        timeout: number;
        request_logging: boolean;
        port: number;
    }
}

export default TabloAPI;
