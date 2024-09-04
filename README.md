# orbit-send
*A web application that allows sharing (of files/text/camera access) over a local network, through webrtc

features include:
    * Automatic discovery of devices in the local network
    * Random assignment of a three word name from a possible 5.5×10⁵ names to each device that connects to a network
    * Transmission of files. (average speed: 1.57 Megabytes per second)
    * Text chat with chat history stored in an indexed db database
    * Sharing of access to camera meaning that the remote device can view the camera input, take phographs and start or stop recording of video. This is good for situations where the camera needs to be far away from the photographer, for example for taking a group photo, selfie or a wildlife photo where the photographer can watch and operate a laptop or smartphone camera from a few meters away.
    * Secure encrypted transmission (I didn't implement this,[ but apparently it is already a feature of webrtc](https://webrtc-security.github.io/#4.3.))
    * Works cross platform. Tested on firefox an chrome on Linux, and android os. Not tested on safari on any apple device because I do not have apple devices
    
