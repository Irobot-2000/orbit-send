// Websocket signalling server 
// data sent should be in the format
//  data = "<16-digit device id><3-char action><data>"
// or to broadcast to all devices with the same public ip
//  data = "BROADCAST_SIGNAL<3-char action><data>"
// This is a slightly modified version of https://github.com/weisrc/rooms/blob/main/mod.ts
const rooms: Record<string, Set<WebSocket>> = {};
// roomIds maps an id to its associated websocket in a room
const roomIds: Record<string, Record<string, WebSocket>> = {};
// roomTable maps an id to its associated name in a room
const roomTable: Record<string, Record<string, string>> = {};
let idCounter = 0;
function handle(req: Request, connInfo: ConnInfo): Response {
	if (req.headers.get("upgrade") != "websocket") {
		return new Response(null, { status: 501 });
	}
	const { socket, response } = Deno.upgradeWebSocket(req);
	// room = public ip address of local network
	const room = parseIpAddress(connInfo.remoteAddr.hostname)
	const peers = (rooms[room] ??= new Set());
	// Set roomIds[room] to a new record if not defined
	const peerIds = (roomIds[room] ??= {})
	// Set roomTable[room] to a new record if not defined
	const peerNames = (roomTable[room] ??= {})
	const id = String(idCounter).padStart(16, '0')
	idCounter++
	//wrap around to an ID of 0 after issuing 9007199254740991 ids
	if (idCounter > 9007199254740991) {
		idCounter = 0;
	}

	socket.onmessage = ({ data }) => {
		//the first 16 characters
		const header = data.slice(0, 16)
		//The rest
		const payload = data.slice(16)
		if (header == "BROADCAST_SIGNAL") {
			const action = payload.slice(0, 3)
			// if the action is to add a new name
			for (const peer of peers) {
				if (peer === socket) continue;
				//send sender's ID along with the payload
				peer.send(id + payload);
			}
		}
		else {
			const receiver = peerIds[header]
			// send message to receiver if receiver exists
			if (receiver) {
				receiver.send(id + payload);
			}
		}
	};

	socket.onopen = () => {
		peers.add(socket);
		peerIds[id] = socket
		let name: string
		do {
			//generate a random name
			name = generateRandomName()
		} while (valInObj(name, peerNames))
		//If the name is not taken
		socket.send(id + "own" + name)
		//send the names already stored
		for (const peerId in peerNames) {
			socket.send(peerId + "add" + peerNames[peerId])
		}
		peerNames[id] = name
		//send the new name to the others
		for (const peer of peers) {
			if (peer != socket) {
				peer.send(id + "add" + name)
				console.log(id,name)
			}
		}
	}
	socket.onclose = () => {
		peers.delete(socket);
		delete roomIds[room][id]
		delete roomTable[room][id]
		delete peerNames[id]
		delete peerIds[id]
		if (peers.size == 0) {
			delete rooms[room]
			delete roomIds[room]
			delete roomTable[room]
		} else {
			for (const peer of peers) {
				peer.send(id + "del");
			}
		}
	}
	return response;
}
function valInObj(searchVal: string, obj: any): boolean {
	for (const k in obj) {
		if (obj[k] == searchVal) {
			return true
		}
	}
	return false
}

function generateRandomName() {
	return ranIntHexByte(100) + ranIntHexByte(50) + ranIntHexByte(110)
}
function ranIntHexByte(maxNotIncluded) {
	return Math.floor(Math.random() * maxNotIncluded).toString(16).padStart(2, "0")
}

function parseIpAddress(ip:string):string{
	if (ip.indexOf(":") != -1)
	{
		//This is an ipv6 address
		// Apparenntly devices in the same LAN have different ipv6 addresses
		// But someone online had said that the first 64bits would be the same, so extracting those
		const missingColons = 7 - countOccurences(ip,":")
		//Replace the :: with :: + the missing number of colons
		ip = ip.replace("::",":".repeat(missingColons + 2))
		const ipArr = ip.split(":")
		let result = ""
		for (let i = 0 ; i < ipArr.length; i++)
		{
			result += ipArr[i] || "0000"
			result += ":"
		}
		return result
	}
	else
	{
		//Devices in the same LAN, most often have the same ipv4 address
		return ip
	}
}

function countOccurences(str:string, searchChar:string)
{
	let count = 0
	for (const c in string)
	{
		if(c == searchChar)
		{
			count++
		}
	}
	return count
}
Deno.serve(handle, { port: 8081 });
