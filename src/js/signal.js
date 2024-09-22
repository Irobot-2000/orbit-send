import * as helpers from "/js/helpers.js"
const SIGNALLING_SERVER = "wss://fresh-hare-95.deno.dev"
//const SIGNALLING_SERVER = "ws://0.0.0.0:8000/"

//Header size in characters
// Signals are in the form <HEADER><ACTION><DATA>
const SIGNAL_HEADER_SIZE = 16
const SIGNAL_ACTION_SIZE = 3
const BROADCAST_HEADER = "BROADCAST_SIGNAL"
const NAME_TAKEN_ERROR = "NAME_TAKEN_ERROR"
// source code for the signalling server can be found in ../../backend-src/mod.ts


class Signal
{
    constructor(onconnect, onmessage, addPeer, delPeer, onPeerInit, setName)
    {
        //onmessage takes two arguments, senderID and payload
        //addPeer takes two arguments , peerId and name
        //delPeer takes one argument , peerId
        //onPeerInit takes 1 argument, peerId
        //setName takes 1 argument, generatedName
        // and signals that peerId wants to start a connection
        this.onmessage = onmessage
        this.onconnect = onconnect
        this.addPeer = addPeer
        this.delPeer = delPeer
        this.onPeerInit = onPeerInit
        this.conn = new WebSocket(SIGNALLING_SERVER)
        this.conn.onopen = () => this.onopen()
        this.peers = {}
        this.setName = setName
    }
    onopen()
    {
        this.conn.onmessage = messageObj => 
        {
            let message = messageObj.data
            let senderId = message.slice(0, SIGNAL_HEADER_SIZE);
            let action = message.slice(SIGNAL_HEADER_SIZE, SIGNAL_HEADER_SIZE + SIGNAL_ACTION_SIZE)
            let data = message.slice(SIGNAL_HEADER_SIZE + SIGNAL_ACTION_SIZE);
            if (action == 'add')
            {
                this.addPeer(senderId, data)
            }
            else if (action == 'del')
            {
                this.delPeer(senderId)
            }
            else if (action == 'ini')
            {
                this.onPeerInit(senderId)
            }
            else if (action == 'mes')
            {
                this.onmessage(senderId, JSON.parse(data))
            }
            else if (action == "own")
            {
                this.setName(data)
            }
        }
        this.onconnect()
        window.addEventListener("onbeforeunload", () =>
        {
            this.conn.close()
        })
    }
    async sendTo(receiver, data)
    {
        await this.reconnectIfDisconnected()
        console.log(receiver)
        this.conn.send(receiver.padStart(SIGNAL_HEADER_SIZE, '0') + "mes" + JSON.stringify(data))
    }
    async broadcast(data)
    {
        await this.reconnectIfDisconnected()
        this.conn.send(BROADCAST_HEADER + "mes" + JSON.stringify(data))
    }
    async sendInit(senderId)
    {
        await this.reconnectIfDisconnected()
        this.conn.send(senderId + "ini")
    }

    async reconnectIfDisconnected()
    {
        if (this.conn.readyState == WebSocket.CLOSED)
        {
            this.conn = new WebSocket(SIGNALLING_SERVER)
            await helpers.eventPromise(this.conn,"open")
            this.onopen()
        }
    }

}

export default Signal