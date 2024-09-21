import Signal from "/js/signal.js"
import * as helpers from "/js/helpers.js"
//External library
import 'https://cdnjs.cloudflare.com/ajax/libs/simple-peer/9.11.1/simplepeer.min.js'
import { showSaveFilePicker } from "https://cdn.jsdelivr.net/npm/native-file-system-adapter/mod.js"

async function main()
{

  if (!WritableStream)
  {
    await import("https://cdn.jsdelivr.net/npm/web-streams-polyfill@4.0.0/+esm")
  }
  // Message Headers
  //1) File transmission
  const START_FILE = 'sfi'
  const END_FILE = 'efi'
  const FILE_DATA = 'fda'
  const MISSING_PACKETS = 'mpa'
  const FILE_ACKNOWLEDEMENT = 'fac'
  const FILE_DECLINE = 'fde'
  const FILE_REQUEST_ACKNOWLEDGEMENT = 'fre'

  //2) Chat
  const CHAT_MESSAGE = "cme"
  const CHAT_MESSAGE_ACKNOWLEDGEMENT = "cma"
  const CHAT_MESSAGE_DECLINE = "cmd"
  //3) Camera
  const CAMERA_CONTROL_MESSAGE = "ccm"
  const CAMERA_SHARE_REQUEST = 'csr'
  const CAMERA_SHARE_ACCEPT = 'csa'
  const CAMERA_SHARE_DECLINE = 'csd'

  //Other constants
  //Notifications are visible for 3 seconds before they disappear
  const NOTIFICATION_ACTIVE_TIME = 3000
  //File constants
  //roughly 16MB in one batch
  const FILE_MAX_PACKETS_IN_BATCH = 1000
  const FILE_PACKET_SIZE = 16000
  //3 bytes for the action, 4 for the packet number
  const FILE_PACKET_HEADER_SIZE = 3 + 4
  // Time in ms waited before sending a missing packet message, to ensure that no more pacets are received
  const FILE_WAIT_FOR_MISSING_PACKETS_INTERVAL = 10
  let peers = {}
  let peerData = {}
  let peerNames = {}
  //Declare event to execute when new peers join
  //Needed for the peer selection modal
  const newPeerEvent = new CustomEvent('newPeerEvent');

  /*
    ____                                      
   / ___|___  _ __ ___  _ __ ___   ___  _ __  
  | |   / _ \| '_ ` _ \| '_ ` _ \ / _ \| '_ \ 
  | |__| (_) | | | | | | | | | | | (_) | | | |
   \____\___/|_| |_| |_|_| |_| |_|\___/|_| |_|
                _      
    ___ ___   __| | ___ 
   / __/ _ \ / _` |/ _ \
  | (_| (_) | (_| |  __/
   \___\___/ \__,_|\___|
                        
  */


  //initialize file manager
  //Allow dropping of files anywhere on the app
  const dropArea = helpers.getEl("#app")
  const fileDisplayArea = helpers.getEl("#file-display-area")
  const fileAddButton = helpers.getEl("#file-add-button")
  const selectionCounter = helpers.getEl("#selection-counter")
  const selectedAllCheckbox = helpers.getEl("#selected-all-checkbox")
  let fileManager = new helpers.FileManager(dropArea, fileDisplayArea, fileAddButton, selectionCounter, selectedAllCheckbox)


  //Initialize chat manager 
  let chatEl = helpers.getEl("#chat-share")
  const mainPeerDisplayEl = helpers.getEl("#main-peer-display")
  const chatIcon = helpers.getEl("#chat-share-icon")
  //The send function is kept empty for now.
  //It will be defined later
  let chatManager = new helpers.ChatMessageManager(chatEl, chatIcon, mainPeerDisplayEl, peerNames, () => { })

  //Initialize the camera manager
  let videoEl = helpers.getEl("#camera-viewer-video")
  let takePhotoButton = helpers.getEl("#take-photo-button")
  let takeVideoButton = helpers.getEl("#take-video-button")
  let switchCameraButton = helpers.getEl("#switch-camera-button")
  let exitCameraButton = helpers.getEl("#exit-camera")
  //the two functions would be defined later
  let cameraManager = new helpers.CameraManager(videoEl, takePhotoButton, takeVideoButton, switchCameraButton, exitCameraButton, () => { }, () => { })

  function displayName(name)
  {
    const profileIcon = helpers.getEl("#profile-icon")
    //function defined in js
    helpers.setPeerIcon(profileIcon, name)

    //Fetch the popover element
    const namePopoverEl = helpers.getEl("#name-popover")
    namePopoverEl.querySelector("#current-name").innerText = name
    const namePopover = $f7.popover.create({ el: namePopoverEl, targetEl: profileIcon })
    namePopoverEl.querySelector("button").onclick = async () => window.location.reload()

    profileIcon.onclick = () => namePopover.open()

  }

  let signal = new Signal(
    () => { },
    (senderId, payload) => { onSignal(senderId, payload); console.log(payload) },
    (id, name) => onPeerAvailable(name, id),
    (id) => { onPeerLeave(id) },
    (id) => { onConnectionRequested(id) },
    (generatedName) =>
    {
      let name = helpers.generatedNameToReadableFormat(generatedName)
      displayName(name)
      //Attach click event to help icon
      const helpIcon = helpers.getEl("#help-icon")
      helpIcon.onclick = () => helpModal(name)
      if (helpers.getCookie("do-not-show-startup-modal") != "true")
      {
        helpModal(name)
      }
      closeLoader()
    }
  )
  //The theme change icon is handled in js
  const notificationsPanel = $f7.panel.create({ el: '#notifications-panel', swipe: true })
  const notificationsIcon = helpers.getEl("#notifications-icon")

  //Show the colours of the icon visible to others


  function onPeerAvailable(generatedName, id)
  {
    console.log(generatedName)
    let name = helpers.generatedNameToReadableFormat(generatedName)
    //Remove all icons for any previous peer with the same id
    document.querySelectorAll(`.p${id}`).forEach(el => el.remove())
    //generate template icon
    let template = helpers.newEl("div", ["device-icon", `p${id}`, "card", "actual-device-icon"])
    //Store id for reference
    template.dataset.id = id
    let icon = helpers.newEl("div", ["circle-icon"])
    //Generate icon. function from js
    helpers.setPeerIcon(icon, name)
    let label = helpers.newEl("label", [], {}, { innerText: name })
    template.append(icon, label)
    const fileIcon = template.cloneNode(true)
    fileIcon.onclick = () => sendFiles(undefined, new Set([id]))
    helpers.getEl("#main-peer-display").prepend(fileIcon)
    helpers.getEl("#selector-peer-display").prepend(template.cloneNode(true))
    // newPeerEvent is needed to automatically update the peer selection modal
    document.dispatchEvent(newPeerEvent)
    peerNames[id] = name
  }



  function onPeerLeave(id)
  {
    document.querySelectorAll(`.p${id}`).forEach(el => el.remove())
  }

  async function connectToPeer(peerId)
  {
    if (peers[peerId])
    {
      return
    }
    peers[peerId] = new SimplePeer({ initiator: true })
    peerData[peerId] = {}
    initializePeerEvents(peerId)
    signal.sendInit(peerId)
    peers[peerId].on("signal", (data) => { signal.sendTo(peerId, data) })
    //Wait until connected
    await helpers.eventPromise(peers[peerId], "connect")
  }

  function onConnectionRequested(peerId)
  {
    peers[peerId] = new SimplePeer({})
    peerData[peerId] = {}
    initializePeerEvents(peerId)
    peers[peerId].on("signal", (data) => { signal.sendTo(peerId, data) })
    peers[peerId].on("connect", () => { console.log("Connected") })
  }


  function onSignal(peerId, payload)
  {
    if (peers[peerId])
    {
      peers[peerId].signal(payload)
    }
  }

  function selectPeerModal()
  {
    let chosenPeers = new Set()
    let checkboxes = new Set()
    let hiddenEl = helpers.getEl("#hidden")
    let modal = helpers.getEl("#peer-selector-modal")
    let resolver = () => { }
    let selectedPromise = new Promise(resolve => resolver = resolve)
    let initializeIcons = () =>
    {
      let icons = helpers.getEl("#selector-peer-display").childNodes
      for (const icon of icons)
      {
        let peerId = icon.dataset.id
        if (!peerId)
        {
          //Do not process anything that does not have a valid peerId
          continue
        }
        let checkbox
        // if checkbox already present
        if (icon.querySelector(".checkbox"))
        {
          checkbox = icon.querySelector(".checkbox input")
          if (checkbox.checked)
          {
            chosenPeers.add(peerId)
          }
        }
        else 
        {
          //Add a check box
          const checkboxContainer = helpers.newEl("label", ["checkbox"])
          checkbox = helpers.newEl("input", [], {}, { type: "checkbox" })
          const checkboxIcon = helpers.newEl("i", ["icon-checkbox"])
          checkboxContainer.append(checkbox, checkboxIcon)
          //append new checkbox
          icon.append(checkboxContainer)
        }
        icon.onclick = () =>
        {
          //clicking the checkbox should also trigger this
          if (checkbox.checked == false)
          {
            //If check box was not checked, it should be checked now
            checkbox.checked = true
            chosenPeers.add(peerId)
            // change color to make selection visible
            icon.classList.add("color-lime")
          }
          else
          {
            //If check box was checked, it should be unchecked now
            checkbox.checked = false
            chosenPeers.delete(peerId)
            icon.classList.remove("color-lime")
          }
        }
        checkboxes.add(checkbox)
      }
    }
    initializeIcons()
    document.addEventListener("newPeerEvent", initializeIcons)
    let exitModal = () =>
    {
      //remove event listener
      document.addEventListener("newPeerEvent", initializeIcons)
      //hide modal by appending it to a div with display:none
      hiddenEl.append(modal)
      //resolve promise with an empty set
      resolver(new Set())
    }

    let sendResult = () =>
    {
      //resolve promise with the chosenPeers
      resolver(chosenPeers)
      //remove event listener
      document.removeEventListener("newPeerEvent", initializeIcons)
      //hide modal by appending it to a div with display:none
      hiddenEl.append(modal)
    }
    const selectAll = () =>
    {
      for (const checkbox of checkboxes)
      {
        // if not checked
        if (!checkbox.checked)
        {
          //Firing on click event
          checkbox.parentElement.click()
        }
      }
    }
    const deselectAll = () =>
    {
      for (const checkbox of checkboxes)
      {
        // if checked
        if (checkbox.checked)
        {
          //Firing on click event to uncheck
          checkbox.parentElement.click()
        }
      }
    }
    helpers.getEl("#peer-select-all").onclick = selectAll
    helpers.getEl("#peer-deselect-all").onclick = deselectAll
    helpers.getEl("#close-peer-modal").onclick = exitModal
    helpers.getEl("#peer-send").onclick = sendResult

    //Open modal
    document.body.append(modal)
    //return promise
    return selectedPromise
  }
  function parseMessage(uint8Array)
  {
    let action = new TextDecoder().decode(uint8Array.subarray(0, 3))
    if (action == FILE_DATA)
    {
      //Extract packet number bytes (first 4 bytes)
      // Note that the ArrayBuffer is sliced instead of the uint8Array subarray
      // function because the subarray function has no effect on the buffer
      let packetNoBytes = uint8Array.buffer.slice(3, 7)
      //console.log(packetNoBytes,new Uint8Array(packetNoBytes),new Uint32Array(packetNoBytes))
      // Cast the array in to an array with 32 bit elements and get the first element
      let packetNo = new Uint32Array(packetNoBytes)[0]
      //The data returned is binary data
      let data = uint8Array.subarray(7)
      return { action, packetNo, data }
    }
    else
    {
      let dataStr = new TextDecoder().decode(uint8Array.subarray(3))
      //console.log(dataStr)
      //The data returned is in JSON notation
      let dataObj = {}
      if (dataStr)
      {
        dataObj = JSON.parse(dataStr)
      }
      return { action, dataObj }
    }


  }
  function closeLoader()
  {
    const loaderEl = helpers.getEl("#loader")
    loaderEl.style.display = "none"
  }
  function helpModal(name)
  {
    const introductionModal = helpers.getEl("#introduction-modal")
    const hiddenEl = helpers.getEl("#hidden")
    const selfIcon = helpers.getEl("#insert-icon-here")
    helpers.setPeerIcon(selfIcon, name)
    const selfName = helpers.getEl("#insert-name-here")
    selfName.innerText = name
    //Set the checkbox to the current value
    const doNotShowAgainCheckbox = helpers.getEl("#do-not-show-startup-modal")
    if (helpers.getCookie("do-not-show-startup-modal") == "true")
    {
      doNotShowAgainCheckbox.checked = true
    }
    else
    {
      doNotShowAgainCheckbox.checked = false 
    }
    //Function to exit the modal
    const exitModal = () =>
    {
      if (doNotShowAgainCheckbox.checked == true)
      {
        helpers.setCookie("do-not-show-startup-modal", "true")
      }
      else
      {
        helpers.setCookie("do-not-show-startup-modal", "false")
      }
      // This automatically unappends the modal from the body first
      hiddenEl.append(introductionModal)
    }
    //Set event listeners on the buttons that close the modal
    introductionModal.querySelectorAll(".close-introduction-modal").forEach(el =>
    {
      el.onclick = exitModal
    })
    //set event listeners to start the guided tour
    introductionModal.querySelectorAll(".guided-tour-button").forEach(el =>
    {
      el.onclick = () => { exitModal(); guidedTour() }
    })

    introductionModal.querySelectorAll(".guide-page-link").forEach(el =>
    {
      el.onclick = () => { exitModal(); openGuidePage() }
    })
    document.body.append(introductionModal)
  }

  async function openGuidePage()
  {
    const view = helpers.newEl("div", ["modal", "view"])
    document.body.append(view)
    const $f7View = $f7.view.create(view)
    $f7View.router.navigate("guide")
    await helpers.eventPromise($f7View.router, "routeChanged")
    helpers.getEl("#go-back-out-of-guide").onclick = () => { view.remove() }

  }
  async function guidedTour()
  {
    const tourGuide = new helpers.TourGuide([
      new helpers.TourAttraction("#file-share", "Welcome to orbit-send. Orbit-send can accomplish 3 tasks, namely file sharing, text sharing, and sharing access to the camera. The default mode is File sharing.", "file-share"),
      new helpers.TourAttraction("#main-peer-display", "This box displays the icons and peer names of devices in the current network that have this website open. Each device is given an automatically generated three word name and a matching icon. The name changes each time you open this website. Do not accept anything from or share to unknown devices. You can share files by clicking the icons of the peers shown here", "file-share"),
      new helpers.TourAttraction("#main-peer-display .actual-device-icon", "Well, it looks like there is someone here already. Click this icon to share files with this peer", "file-share"),
      new helpers.TourAttraction("#file-add-button", "Click this button to choose files to share.", "file-share"),
      new helpers.TourAttraction("#file-display-area", "Once selected the file icons will appear here.Click one of those icons to select the file specifically.", "file-share"),
      new helpers.TourAttraction("#share-selected-files", "Click this button to share the files that were specifically selected...", "file-share"),
      new helpers.TourAttraction("#share-all-files", "...or click this one to share all the files that were chosen. Remember, files cannot be sent until the receiver agrees to download them, so DO NOT ACCEPT FILES FROM UNKNOWN DEVICES", "file-share"),
      new helpers.TourAttraction(".toolbar.tabbar-icons.toolbar-bottom", "This is the tab bar, you can choose to share files, chat, or share the camera from here", "file-share"),
      new helpers.TourAttraction("#chat-share-icon", "Clicking this icon will...", "file-share"),
      new helpers.TourAttraction("#chat-share", "... Open this tab. Here you can send text messages to devices on the local network that have this website open. Messages cannot be sent until the receiver agrees to accept them. Do not accept messages from unknown devices", "chat-share"),
      new helpers.TourAttraction("#camera-share-icon", "Clicking this icon will...", "chat-share"),
      new helpers.TourAttraction("#camera-share", "...Open this tab. Here you can share access to your camera, such that a different device nearby can take photograps or videos with your devices camera. This is good for taking group photos or selfies. Click an icon representing a known device to share access. Do not share access to unknown devices.", "camera-share"),
      new helpers.TourAttraction("#file-share-icon", "Clicking this icon will...", "camera-share"),
      new helpers.TourAttraction("#file-share", "...open this tab, where this tour started and where it now ends. That's all folks! enjoy!", "file-share"),


    ])
    tourGuide.next()
  }
  function initializePeerEvents(peerId)
  {
    const peer = peers[peerId]
    const ondata = async (binaryData) =>
    {
      const message = parseMessage(binaryData)
      //console.log(message)
      if (message.action == START_FILE)
      {
        //message.dataObj has properties sizeInBytes and fileName
        if (!peerData[peerId].fileData || peerData[peerId].fileData.totalPackets == peerData[peerId].fileData.receivedPackets)
        {
          //Initially peerData[peerId].remberFilePermissions is undefined so this condition is stisfied
          if (!peerData[peerId].remberFilePermissions)
          {
            //If the options are changed change the conditional below to match
            const options = ["Accept this file", "Accept all files from sender", "Reject this file", "Reject all files from sender"]
            const responseNum = await helpers.customConfirm("Do you want to receive this file?", peerNames[peerId] + " wants to send you the file : " + message.dataObj.fileName + `(${helpers.getReadableFileSize(message.dataObj.sizeInBytes, 3)})`, options)
            //If it is Accept all files from sender or reject all files from sender
            if (responseNum == 1 || responseNum == 3)
            {
              peerData[peerId].remberFilePermissions = true
            }
            // if first 6 letters is "Reject" 
            if (responseNum == 2 || responseNum == 3)
            {
              peerData[peerId].filePermissions = false
            }
            else
            {
              peerData[peerId].filePermissions = true
            }
          }
          //Send FILE_DECLINE if declined
          if (peerData[peerId].filePermissions == false)
          {
            peer.send(FILE_DECLINE)
            return
          }
          const sizeInBytes = message.dataObj.sizeInBytes
          console.log(sizeInBytes)
          //Each packet is 16KB
          const totalPackets = Math.ceil(message.dataObj.sizeInBytes / FILE_PACKET_SIZE)
          //No packets have been received initially
          let receivedPackets = 0;
          //No batches have been processed yet
          let batchStartPacketNo = 0
          //Allows the file to be saved
          const fileHandle = await showSaveFilePicker({
            _preferPolyfill: false,
            suggestedName: message.dataObj.fileName,
            excludeAcceptAllOption: false
          })
          //Array to store whether a specific packet in the batch has been received
          let hasReceivedPacketNo = new Array()
          let packetsInBatch = Math.min(FILE_MAX_PACKETS_IN_BATCH, totalPackets)
          for (let i = 0; i < packetsInBatch; i++)
          {
            hasReceivedPacketNo[i] = false
          }
          const writableStream = await fileHandle.createWritable();
          let batchSize = FILE_MAX_PACKETS_IN_BATCH * FILE_PACKET_SIZE
          //The file is smaller than a single barch
          if (packetsInBatch < FILE_MAX_PACKETS_IN_BATCH)
          {
            //the whole file is the batch
            batchSize = sizeInBytes
          }
          let batch = new Uint8Array(new ArrayBuffer(batchSize))
          const notification = new helpers.CustomNotification(peerNames[peerId], NOTIFICATION_ACTIVE_TIME, notificationsPanel, notificationsIcon)
          notification.displayProgressbar("receiving " + message.dataObj.fileName)
          //Update progress every 500ms
          const notificationInterval = window.setInterval(() =>
          {
            const fileData = peerData[peerId].fileData
            const fraction = fileData.receivedPackets / fileData.totalPackets
            const progressText = helpers.getReadableFileSize(fileData.sizeInBytes * fraction, 3) + " downloaded"
            notification.setProgress(fraction * 100, progressText)
          }, 500)

          peerData[peerId].fileData = { fileName: message.dataObj.fileName, sizeInBytes, totalPackets, hasReceivedPacketNo, receivedPackets, writableStream, batch, batchStartPacketNo, notification, notificationInterval }
          peer.send(FILE_ACKNOWLEDEMENT)
        }
        else
        {
          window.clearInterval(peerData[peerId].fileData.notificationInterval)
          helpers.error("Error receiving file")

        }
      }
      else if (message.action == FILE_REQUEST_ACKNOWLEDGEMENT)
      {
        //check if any packets are missing
        let missingPackets = []
        let hasReceivedPacketNo = peerData[peerId].fileData.hasReceivedPacketNo
        const batchStartPacketNo = peerData[peerId].fileData.batchStartPacketNo
        let oldMissingCount = 0
        let newMissingCount = hasReceivedPacketNo.length - (peerData[peerId].fileData.receivedPackets - peerData[peerId].fileData.batchStartPacketNo)
        while (newMissingCount > 0 && newMissingCount != oldMissingCount)
        {
          await helpers.wait(FILE_WAIT_FOR_MISSING_PACKETS_INTERVAL)
          oldMissingCount = newMissingCount
          newMissingCount = hasReceivedPacketNo.length - (peerData[peerId].fileData.receivedPackets - peerData[peerId].fileData.batchStartPacketNo)

        }

        if (newMissingCount > 0)
        {
          for (let i = 0; i < hasReceivedPacketNo.length; i++)
          {
            //If packet not received
            if (!hasReceivedPacketNo[i])
            {
              missingPackets.push(batchStartPacketNo + i)
            }
          }
          //Notify the sender what packets are missing
          peer.send(MISSING_PACKETS + JSON.stringify(missingPackets))
        }
        else 
        {
          const totalPackets = peerData[peerId].fileData.totalPackets
          const batch = peerData[peerId].fileData.batch
          //Write the batch to disk
          //alert("len"+batch.length)
          peerData[peerId].fileData.writableStream.write(batch)
          //batch.length is the size in byes of the batch
          //alert("len2" + batch.length)
          peerData[peerId].fileData.batchStartPacketNo += batch.length / FILE_PACKET_SIZE
          //alert("len3" + peerData[peerId].fileData.batchStartPacketNo)
          const packetsLeft = totalPackets - peerData[peerId].fileData.batchStartPacketNo
          //Declare variable to store size in bytes of batch
          let packetsInBatch
          let batchSize
          //If last batch 
          if ((packetsLeft) < FILE_MAX_PACKETS_IN_BATCH && packetsLeft != 0)
          {
            batchSize = peerData[peerId].fileData.sizeInBytes - peerData[peerId].fileData.batchStartPacketNo * FILE_PACKET_SIZE
            packetsInBatch = packetsLeft
          }
          else
          {
            packetsInBatch = FILE_MAX_PACKETS_IN_BATCH
            batchSize = packetsInBatch * FILE_PACKET_SIZE
          }
          //The garbage collector will get rid of the old ArrayBuffer
          peerData[peerId].fileData.batch = new Uint8Array(new ArrayBuffer(batchSize))
          hasReceivedPacketNo = new Array()
          peerData[peerId].fileData.hasReceivedPacketNo = hasReceivedPacketNo
          for (let i = 0; i < packetsInBatch; i++)
          {
            hasReceivedPacketNo[i] = false
          }
          //Notify the sender that all packets have been received
          peer.send(FILE_ACKNOWLEDEMENT)
        }
      }
      else if (message.action == FILE_DATA)
      {
        //if filePermissions is undefined or false
        if (!peerData[peerId].filePermissions)
        {
          //self destruct for security reasons
          peer.destroy()
          peers[peerId] = null
        }

        let hasReceivedPacketNo = peerData[peerId].fileData.hasReceivedPacketNo
        const batchStartPacketNo = peerData[peerId].fileData.batchStartPacketNo
        // The index of the ByteArray where the packet data is stored
        const batchByteOffset = (message.packetNo - batchStartPacketNo) * FILE_PACKET_SIZE
        //Store that the packet has been recieved
        if(!hasReceivedPacketNo[message.packetNo - batchStartPacketNo])
        {
          //if packet has not already been received
          peerData[peerId].fileData.receivedPackets++
          hasReceivedPacketNo[message.packetNo - batchStartPacketNo] = true
          //console.log(peerData[peerId].fileData.batch, batchByteOffset, batchStartPacketNo)
          peerData[peerId].fileData.batch.set(message.data, batchByteOffset)
          if (!message.data)
          {
            console.log(message.data)
          }
        }

      }
      else if (message.action == END_FILE)
      {

        //If file permissions not given
        if (!peerData[peerId].filePermissions)
        {
          //self destruct for security reasons
          peer.destroy()
          peers[peerId] = null
        }
        //Automatically saves file
        peerData[peerId].fileData.writableStream.close()
        //Show sucessfully received message
        peerData[peerId].fileData.notification.displayText("The file " + peerData[peerId].fileData.fileName + " was successfully received ")
        //clear notification interval
        window.clearInterval(peerData[peerId].fileData.notificationInterval)
        peerData[peerId].fileData = null
      }
      //Handling chat messages
      if (message.action == CHAT_MESSAGE)
      {
        if (!peerData[peerId].rememberChatBlockOrUnblock)
        {
          const response = await helpers.customConfirm(peerNames[peerId] + " has sent a message to you", "Would you like to view the message?", ["yes, accept the message", "yes, always accept from peer", "no, block message", "no, always block peer"])
          if (response == 2 || response == 3)
          {
            //if rejected
            peerData[peerId].blockChat = true
          }
          else
          {
            peerData[peerId].blockChat = false
          }

          if (response == 1 || response == 3)
          {
            //if remember choice
            peerData[peerId].rememberChatBlockOrUnblock = true
          }
          else
          {
            peerData[peerId].rememberChatBlockOrUnblock = false
          }

        }
        if (!peerData[peerId].blockChat)
        {
          chatManager.addMessage(peerId, message.dataObj, false)
          peer.send(CHAT_MESSAGE_ACKNOWLEDGEMENT)
          const notificationOnclick = () =>
          {
            $f7.tab.show("#chat-share")
            chatManager.showChatContainer(peerId)
          }
          const notification = new helpers.CustomNotification(peerNames[peerId], NOTIFICATION_ACTIVE_TIME, notificationsPanel, notificationsIcon, notificationOnclick)
          notification.displayText("~~~" + message.dataObj + "~~~")
        }
        else
        {
          peer.send(CHAT_MESSAGE_DECLINE)
        }

      }


      else if (message.action == CAMERA_SHARE_REQUEST)
      {
        if (!peerData[peerId].alwaysRejectCameraAccess)
        {
          const choice = await helpers.customConfirm(peerNames[peerId] + " wants to share camera access to you", "Do you want to accept?", ["yes, Accept", "no. Decline.", "Always decline for peer"])
          if (choice == 1 || choice == 2)
          {
            peerData[peerId].rejectCameraAccess = true
            peers[peerId].send(CAMERA_SHARE_DECLINE)
            if (choice == 2)
            {
              peerData[peerId].alwaysRejectCameraAccess = true
            }
          }
          else
          {
            peerData[peerId].rejectCameraAccess = false
            peers[peerId].send(CAMERA_SHARE_ACCEPT)
            $f7.tab.show("#camera-share")

          }
        }
      }
      else if (message.action == CAMERA_CONTROL_MESSAGE)
      {
        if (peerId == cameraManager.currentPeerId)
        {
          cameraManager.handleControlMessages(message.dataObj)
        }
      }
      //if event handler set
      if (typeof peerData[peerId]["on" + message.action] == "function")
      {
        //Execute event handler
        peerData[peerId]["on" + message.action](message)
      }
    }
    peer.on("data", ondata)

    peer.on("stream", (stream) =>
    {
      if (peerData[peerId].alwaysRejectCameraAccess || peerData[peerId].rejectCameraAccess)
      {
        //Reject the video stream by disconnecting
        peer.destroy()
      }
      else
      {
        cameraManager.connectToPeerStream(stream, peerId)
      }
    })
    //Set peer Data
    peerData[peerId].on = (eventName, eventHandler) => peerData[peerId]["on" + eventName] = eventHandler
    peerData[peerId].off = (eventName, eventHandler) =>
    {
      if (peerData[peerId]["on" + eventName] == eventHandler) 
      {
        peerData[peerId]["on" + eventName] = null
      }
    }
    peerData[peerId].tasks = []
    peerData[peerId].tasksFinished = true
    peerData[peerId].pushTask = async (task) =>
    {
      peerData[peerId].tasks.push(task)
      //If tasks are not being executed
      if (peerData[peerId].tasksFinished)
      {
        peerData[peerId].tasksFinished = false
        //start executing tasks
        while (peerData[peerId].tasks.length > 0)
        {
          const task = peerData[peerId].tasks.shift()
          await task()
        }
        peerData[peerId].tasksFinished = true
      }
    }
  }

  /*
    __ _ _           
   / _(_) | ___ 
  | |_| | |/ _ \
  |  _| | |  __/
  |_| |_|_|\___|

    _                                 _         _             
  | |_ _ __ __ _ _ __  ___ _ __ ___ (_)___ ___(_) ___  _ __  
  | __| '__/ _` | '_ \/ __| '_ ` _ \| / __/ __| |/ _ \| '_ \ 
  | |_| | | (_| | | | \__ \ | | | | | \__ \__ \ | (_) | | | |
  \__|_|  \__,_|_| |_|___/_| |_| |_|_|___/___/_|\___/|_| |_|
                                                              
                      
  */
  async function sendFiles(fileSet, receiverPeers)
  {
    const action = new TextEncoder().encode(FILE_DATA)
    receiverPeers = receiverPeers || await selectPeerModal()
    fileSet = fileSet || await chooseFileSystemPrompt()
    for (const peerId of receiverPeers)
    {
      await connectToPeer(peerId)
      //console.log(1234)
      for (const file of fileSet)
      {
        //console.log(file)
        const sendFile = async () =>
        {
          const notification = new helpers.CustomNotification(peerNames[peerId], NOTIFICATION_ACTIVE_TIME, notificationsPanel, notificationsIcon)
          let peer = peers[peerId]
          //message.dataObj has properties sizeInBytes and fileName
          peer.send(START_FILE + JSON.stringify({ sizeInBytes: file.size, fileName: file.name }))
          notification.displayProgressbar("Waiting for the receiver to accept", true)
          let message = await Promise.any([
            helpers.eventPromise(peerData[peerId], FILE_ACKNOWLEDEMENT),
            helpers.eventPromise(peerData[peerId], FILE_DECLINE)
          ])
          if (message.action == FILE_DECLINE)
          {
            notification.displayText("File declined")
            return
          }
          notification.displayProgressbar("Sending " + file.name)
          const totalPackets = Math.ceil(file.size / FILE_PACKET_SIZE)
          let packetsSent = 0
          let notifyInterval = window.setInterval(() =>
          {
            const fraction = packetsSent / totalPackets
            const progressText = helpers.getReadableFileSize(file.size * fraction, 3) + " uploaded"
            notification.setProgress(fraction * 100, progressText)
          }, 500)
          //Iterate over the batch
          try
          {
            for (let i = 0; i < totalPackets; i += FILE_MAX_PACKETS_IN_BATCH)
            {
              const packetsInBatch = Math.min(FILE_MAX_PACKETS_IN_BATCH, totalPackets - i)
              for (let packetNo = i; packetNo < packetsInBatch + i - 1; packetNo++)
              {
                //send packet
                packetsSent++
                sendPacket(file, peer, packetNo, totalPackets, action)
              }
              //Don't worry, we will break out of the loop later
              while (true)
              {
                //await helpers.wait(1000)
                await sendPacket(file, peer, packetsInBatch + i - 1, totalPackets, action)
                peer.send(FILE_REQUEST_ACKNOWLEDGEMENT)
                let message = await Promise.any([
                  helpers.eventPromise(peerData[peerId], FILE_ACKNOWLEDEMENT),
                  helpers.eventPromise(peerData[peerId], MISSING_PACKETS)
                ])
                if (message.action == FILE_ACKNOWLEDEMENT)
                {
                  //Exit the loop
                  break
                }
                let missingPackets = message.dataObj
                missingPackets.sort()
                for (const missingPacketNo of missingPackets)
                {
                  await sendPacket(file, peer, missingPacketNo, totalPackets, action)
                }
              }
            }
            peer.send(END_FILE)
            notification.displayText("File " + file.name + " sucessfully tansferred")
          }
          catch {
            notification.displayText("There was an helpers.error sending " + file.name)
            peers[peerId] = null
            peerData[peerId] = null
          }
          finally
          {
            //Whatever happens ensure that interval is cleared
            window.clearInterval(notifyInterval)
          }

        }
        peerData[peerId].pushTask(sendFile)
      }
    }
  }

  async function chooseFileSystemPrompt()
  {
    let resolver = null
    const promise = new Promise(r => resolver = r)
    const fileInput = helpers.newEl("input", ["display-none"], {}, { type: "file", multiple: true })
    fileInput.onchange = () =>
    {
      resolver(fileInput.files)
    }
    fileInput.click()
    return promise

  }

  async function sendPacket(file, peer, packetNo, totalPackets, action)
  {
    const start = packetNo * FILE_PACKET_SIZE
    let end
    let packet
    if (packetNo == totalPackets - 1)
    {
      //If it is the last packet
      end = file.size
    }
    else
    {
      end = start + FILE_PACKET_SIZE
    }
    //Ok, the problem now is that the recipient device expects the packet
    // to be prefixed with a header, but an ArrayBuffer has a fixed size
    // with no space for a header. I could not find a way to concatenate ArrayBuffers
    if (start == 0)
    {
      // If this is the first packet
      const data = await file.slice(start, end).arrayBuffer()
      //Create a new ArrayBuffer with space for both the header and payload 
      packet = new Uint8Array(FILE_PACKET_HEADER_SIZE + data.byteLength)
      //Write the header
      //action is already a Uint8Array
      packet.set(action, 0)
      packet.set(new Uint8Array([0, 0, 0, 0]), action.length)
      //Write the data
      packet.set(new Uint8Array(data), FILE_PACKET_HEADER_SIZE)
    }
    else
    {
      //Fetch few more bytes before the actual data, to leave space for the header
      //This time, packet is initialized with the file data
      packet = new Uint8Array(await (file.slice(start - FILE_PACKET_HEADER_SIZE, end)).arrayBuffer())
      packet.set(action, 0)
      packet.set(helpers.uintToByteArr(packetNo), action.byteLength)
      //console.log(packetNo,action,packet)

    }
    peer.send(packet)
  }
  helpers.getEl("#share-all-files").onclick = () =>
  {
    sendFiles(fileManager.getAllFiles())
  }

  helpers.getEl("#share-selected-files").onclick = () =>
  {
    sendFiles(fileManager.getSelectedFiles())
  }


  /*

    _ __ ___   ___  ___ ___  __ _  __ _  ___  ___ 
  | '_ ` _ \ / _ \/ __/ __|/ _` |/ _` |/ _ \/ __|
  | | | | | |  __/\__ \__ \ (_| | (_| |  __/\__ \
  |_| |_| |_|\___||___/___/\__,_|\__, |\___||___/
                                  |___/           
  */


  async function sendChatMessage(message, receiverPeer)
  {
    let receiverPeers
    if (!receiverPeer)
    {
      //if no recipient peers are defined
      receiverPeers = await selectPeerModal()
    }
    else
    {
      receiverPeers = [receiverPeer]
    }
    for (const peerId of receiverPeers)
    {

      await connectToPeer(peerId)
      const peer = peers[peerId]
      peer.send(CHAT_MESSAGE + JSON.stringify(message))
      Promise.any([helpers.eventPromise(peerData[peerId], CHAT_MESSAGE_ACKNOWLEDGEMENT), helpers.eventPromise(peerData[peerId], CHAT_MESSAGE_DECLINE)]).then(
        response =>
        {
          if (response.action == CHAT_MESSAGE_ACKNOWLEDGEMENT)
          {
            chatManager.addMessage(peerId, message, true)
          }
          else
          {
            const notification = new helpers.CustomNotification(peerNames[peerId], NOTIFICATION_ACTIVE_TIME, notificationsPanel, notificationsIcon)
            notification.displayText("sorry, message declined")
          }
        }
      )

    }

  }




  chatManager.sendMessage = sendChatMessage

  document.addEventListener("newPeerEvent", () =>
  {
    chatManager.setUpPeerDisplay()
  })
  /*
   ____                               
  / ___|__ _ _ __ ___   ___ _ __ __ _ 
 | |   / _` | '_ ` _ \ / _ \ '__/ _` |
 | |__| (_| | | | | | |  __/ | | (_| |
  \____\__,_|_| |_| |_|\___|_|  \__,_|
                                      
    ____  _                _             
 / ___|| |__   __ _ _ __(_)_ __   __ _ 
 \___ \| '_ \ / _` | '__| | '_ \ / _` |
  ___) | | | | (_| | |  | | | | | (_| |
 |____/|_| |_|\__,_|_|  |_|_| |_|\__, |
                                 |___/ 
  */

  async function sendCameraOfferTo(peerId)
  {
    const response = await helpers.customConfirm("Are you sure you want to share camera access to " + peerNames[peerId] + "?"
      , peerNames[peerId] + "will receive live video input taken from your camera",
      ["yes, share access to the camera", "no, prevent access to the camera"])
    if (response == 0)
    {
      //if yes
      await connectToPeer(peerId)
      const peer = peers[peerId]
      const notification = new helpers.CustomNotification(peerNames[peerId], NOTIFICATION_ACTIVE_TIME, notificationsPanel, notificationsIcon)
      notification.displayProgressbar("Waiting for peer to accept", true)
      peer.send(CAMERA_SHARE_REQUEST)
      const reply = await Promise.any([helpers.eventPromise(peerData[peerId], CAMERA_SHARE_ACCEPT),
      helpers.eventPromise(peerData[peerId], CAMERA_SHARE_DECLINE)])
      if (reply.action == CAMERA_SHARE_ACCEPT)
      {
        notification.displayText("Peer accepted")
        //Start stream
        cameraManager.shareStream(peerId)
      }
      else
      {
        notification.displayText("Peer declined connection")
      }
    }
  }
  function setUpCameraPeerDisplay()
  {
    const templates = helpers.getEl("#main-peer-display").childNodes
    const cameraPeerDisplay = helpers.getEl("#camera-peer-display")
    if (templates)
    {
      for (const template of templates)
      {
        const peerId = template.dataset.id
        //If icon not already present and peerId is not undefined
        if (peerId && !cameraPeerDisplay.querySelector(".p" + peerId))
        {
          const icon = template.cloneNode(true)
          icon.onclick = () => sendCameraOfferTo(peerId)
          cameraPeerDisplay.append(icon)
        }
      }
    }
  }

  setUpCameraPeerDisplay()
  document.addEventListener("newPeerEvent", () => { setUpCameraPeerDisplay() })
  async function sendCameraControlMessage(message, peerId)
  {
    await connectToPeer(peerId)
    peers[peerId].send(CAMERA_CONTROL_MESSAGE + JSON.stringify(message))
  }

  async function sendStream(stream, peerId)
  {

    await connectToPeer(peerId)
    peers[peerId].addStream(stream)
  }

  cameraManager.sendStream = sendStream
  cameraManager.sendControlMessage = sendCameraControlMessage

  console.log(peers)
  window.peers = peers
}


async function start()
{
  document.removeEventListener("DOMContentLoaded", start);
  try
  {
    await main()
  }
  catch (error)
  {
    console.log(error)
    await helpers.error(error)
    start()
  }
}

document.addEventListener("DOMContentLoaded", start);
