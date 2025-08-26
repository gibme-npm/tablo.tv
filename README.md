# Tablo TV API Tooling

This package is not affiliated with or acting on behalf of Tablo TV

## Documentation

[https://gibme-npm.github.io/tablo.tv](https://gibme-npm.github.io/tablo.tv)

### Note

The access key and secret key required to interact with a Tablo device are not included in this repository but are required to use the Device API.

## Features

* Tablo Lighthouse API
  * Non-Authenticated API
    * List available devices
    * List virtual devices
  * Authenticated API
    * Retrieve account information
    * List Devices
    * Resolve Device
    * Device contexts
    * List guide channels
    * List of current live airings
    * Retrieve channel airings
* Tablo Device API
  * Discover devices
  * General Methods
    * Retrieve device information
    * Retrieve device settings
    * Retrieve device storage information
    * Retrieve device hard drive information
    * Retrieve device location information
    * Retrieve device subscription information
    * Retrieve account subscription information
    * Retrieve device capabilities
  * Device Updates
    * Retrieve device update information
    * Retrieve device update progress
  * Channels
    * Retrieves channels scan information
    * Retrieves previous channel scan information
    * Retrieves list of channels
    * Retrieves guide status
    * Retrieves airings (all or filtered)
  * Watch Sessions
    * Session Management
      * Launches a watch session
      * Retrieves a watch session
      * Sends watch session keepalive
      * Deletes/stops a watch session
  * Live Stream Transcoding
    * Utilizes FFMPEG
    * Handles live transcoding of watch sessions
    * Transcode the stream from MPEG2 to H.264
    * Outputs to a local file path with M3U8 playlist
    * Rolling stream to preset number of segments
