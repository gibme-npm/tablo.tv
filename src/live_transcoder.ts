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

import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import ffmpeg from 'ffmpeg-static';
import which from 'which';
import type { Tablo } from './tablo';
import { createHash } from 'crypto';
import Timer from '@gibme/timer';

export default class LiveTranscoder extends EventEmitter {
    private static readonly instances = new Map<string, LiveTranscoder>();
    private readonly ffmpeg_path: string;
    private process?: ChildProcess;
    private timer?: Timer;
    private emitter = new EventEmitter();
    private restart_count = 0;
    private stopping = false;
    private static readonly MAX_RESTARTS = 5;
    private static readonly READY_TIMEOUT = 30_000;
    private static readonly MIN_KEEPALIVE = 60;

    /**
     * Creates a new live transcoder instance.
     *
     * The `output_path` must be a valid path to a directory on the local filesystem.
     *
     * The `channel_id` must be a valid channel ID for the specified `device`.
     *
     * The `device` must be a valid `Device` instance.
     * @param id
     * @param device
     * @param channel_id
     * @param output_path
     * @param filename
     * @param auto_restart
     */
    protected constructor (
        public readonly id: string,
        private readonly device: Tablo,
        private readonly channel_id: string,
        public readonly output_path: string,
        public readonly filename = 'stream.m3u8',
        public readonly auto_restart = true
    ) {
        super();

        try {
            this.ffmpeg_path = ffmpeg ?? which.sync('ffmpeg');
        } catch {
            throw new Error('ffmpeg is not installed. Install ffmpeg or ensure ffmpeg-static provides a valid binary.');
        }

        this.emitter.on('abort', async () => {
            this.stopping = true;

            if (this.process) {
                try {
                    if (!this.process.killed) {
                        this.process.kill();
                    }
                } catch {
                }

                delete this.process;

                this.timer?.destroy();

                delete this.timer;

                if (this.session) {
                    await this.device.deleteSession(this.session);
                }

                this.active = false;

                this.emitter.emit('stopped');
            }
        });

        this.emitter.on('stopped', () => {
            try {
                const current_path = resolve(this.output_path, `./${this.id}`);
                const base = resolve(this.output_path);

                if (current_path.startsWith(base) && existsSync(current_path)) {
                    rmSync(current_path, { recursive: true, force: true });
                }
            } catch {
            }

            LiveTranscoder.instances.delete(this.id);

            this.emit('stopped');
        });

        const base_path = resolve(output_path);
        this.full_path = resolve(output_path, `./${this.id}`);

        if (!this.full_path.startsWith(base_path)) {
            throw new Error('Resolved output path escapes the base output directory');
        }

        if (existsSync(this.full_path)) {
            rmSync(this.full_path, { recursive: true, force: true });
        }

        mkdirSync(this.full_path, { recursive: true });

        this.full_path = resolve(this.full_path, `./${this.filename}`);
    }

    private _use_count = 0;

    public get use_count (): number {
        return this._use_count;
    }

    private _active = false;

    public get active (): boolean {
        return this._active;
    }

    private set active (active: boolean) {
        this._active = active;
    }

    private _full_path: string = '';

    public get full_path (): string {
        return this._full_path;
    }

    private set full_path (path: string) {
        this._full_path = path;
    }

    private _session?: Tablo.PlayerSession;

    public get session (): Tablo.PlayerSession | undefined {
        return this._session;
    }

    private set session (session: Tablo.PlayerSession | undefined) {
        this._session = session;
    }

    public get channel (): Tablo.Channel | undefined {
        return this.session?.channel;
    }

    public get relative_path (): string {
        if (this.id) {
            return `${this.output_path}/${this.id}/${this.filename}`
                .replace('//', '/');
        } else {
            return '';
        }
    }

    /**
     * Retrieves an existing instance of a live transcoder or creates a new instance if one does not exist.
     *
     * The `device` must be a valid `Device` instance.
     *
     * The `channel_id` must be a valid channel ID for the specified `device`.
     *
     * The `output_path` must be a valid path to a directory on the local filesystem.
     *
     * The `filename` is the name of the output file.
     *
     * @param device
     * @param channel_id
     * @param output_path
     * @param filename
     * @param auto_restart
     */
    public static async instance (
        device: Tablo,
        channel_id: string,
        output_path: string,
        filename = 'stream.m3u8',
        auto_restart = true
    ): Promise<LiveTranscoder> {
        const info = await device.info();

        if (!info) {
            throw new Error('Failed to retrieve device information');
        }

        const id = createHash('sha256')
            .update(JSON.stringify({ server_id: info.server_id, channel_id }))
            .digest('hex');

        let instance = this.instances.get(id);

        if (!instance) {
            instance = new LiveTranscoder(id, device, channel_id, output_path, filename, auto_restart);

            this.instances.set(id, instance);
        }

        return instance;
    }

    public on(event: 'error', listener: (error: Error) => void): this;

    public on(event: 'exit', listener: (code: number | null) => void): this;

    public on(event: 'ready', listener: () => void): this;

    public on(event: 'stopped', listener: () => void): this;

    public on (event: any, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public once(event: 'error', listener: (error: Error) => void): this;

    public once(event: 'exit', listener: (code: number | null) => void): this;

    public once(event: 'ready', listener: () => void): this;

    public once(event: 'stopped', listener: () => void): this;

    public once (event: any, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }

    public off(event: 'error', listener: (error: Error) => void): this;

    public off(event: 'exit', listener: (code: number | null) => void): this;

    public off(event: 'ready', listener: () => void): this;

    public off(event: 'stopped', listener: () => void): this;

    public off (event: any, listener: (...args: any[]) => void): this {
        return super.off(event, listener);
    }

    /**
     * Starts the live transcoder.
     *
     * The live transcoder will attempt to start a new session for the specified `channel_id` on the specified `device`.
     *
     * If a session is successfully started, the live transcoder will attempt to start a new transcoding process.
     */
    public async start (): Promise<boolean> {
        if (this.active) {
            this._use_count++;

            this.emit('ready');

            return true;
        }

        this.session = await this.device.watchChannel(this.channel_id);

        if (!this.session) {
            this.emit('error', new Error('Failed to start session'));

            return false;
        }

        const keepalive_interval = Math.max(this.session.keepalive - 30, LiveTranscoder.MIN_KEEPALIVE) * 1000;

        this.timer = new Timer(keepalive_interval);

        this.timer.on('tick', async () => {
            if (this.session) {
                await this.device.keepaliveSession(this.session);
            }
        });

        this._use_count++;

        this.restart_count = 0;

        const started = this.start_ffmpeg();

        if (started) {
            const deadline = Date.now() + LiveTranscoder.READY_TIMEOUT;

            const check = () => setTimeout(() => {
                if (existsSync(this.full_path)) {
                    this.active = true;

                    this.emit('ready');
                } else if (Date.now() >= deadline) {
                    this.emit('error', new Error('Timed out waiting for ffmpeg to produce output'));

                    this.emitter.emit('abort');
                } else {
                    check();
                }
            }, 100);

            check();
        }

        return started;
    }

    /**
     * Stops the live transcoder.
     */
    public stop (): void {
        if (this._use_count > 0) {
            this._use_count--;
        }

        if (this.active && this._use_count <= 0) {
            this.emitter.emit('abort');
        }
    }

    /**
     * Attempts to start the FFMpeg process
     * @private
     */
    private start_ffmpeg (): boolean {
        if (!this.session) {
            return false;
        }

        const args = ['-re', '-i', `${this.session.playlist_url}`,
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune',
            'zerolatency', '-crf', '23', '-g', '48',
            '-keyint_min', '48', '-sc_threshold', '0', '-ac',
            '2', '-c:a', 'aac', '-b:a', '128k',
            '-f', 'hls', '-hls_time', '4', '-hls_list_size',
            '6', '-hls_flags', 'delete_segments+program_date_time+append_list',
            this.full_path];

        this.process = spawn(this.ffmpeg_path, args, {
            detached: false,
            shell: false,
            windowsHide: false,
            stdio: ['pipe', 'ignore', 'ignore']
        });

        const handle_restart = () => {
            if (this.stopping) {
                return;
            }

            if (!this.auto_restart) {
                this.emitter.emit('abort');
                return;
            }

            this.restart_count++;

            if (this.restart_count > LiveTranscoder.MAX_RESTARTS) {
                this.emit('error', new Error(
                    `ffmpeg exceeded maximum restart attempts (${LiveTranscoder.MAX_RESTARTS})`));
                this.emitter.emit('abort');
                return;
            }

            const delay = Math.min(1000 * Math.pow(2, this.restart_count - 1), 30_000);

            setTimeout(() => this.start_ffmpeg(), delay);
        };

        this.process.on('error', error => {
            this.emit('error', error);

            handle_restart();
        });

        this.process.on('exit', code => {
            this.emit('exit', code);

            handle_restart();
        });

        return true;
    }
}

export { LiveTranscoder };
