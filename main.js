const startBtn = document.getElementById('startBtn');
const joinBtn = document.getElementById('joinBtn');
const endBtn = document.getElementById('endBtn');
const incommingCallDialog = document.getElementById('incomming-dialog');
const notificationDialog = document.getElementById('notification-dialog');
const notificaionMessage = document.getElementById('notificaion-message');
const nameDialog = document.getElementById('name-dialog');
const nameField = document.getElementById('name-field');
const playerContainer = document.getElementById('player-container');
const greatting = document.getElementById('greatting');
const actionContainer = document.getElementById('action-container');
const userNameEl = document.getElementById('user-name');
const screenShareBtn = document.getElementById('screen-share');

const urlParams = new URLSearchParams(window.location.search);
const configuration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}, {'urls': 'turn:freeturn.net:3478',username: 'free',
            credential: 'free'}]}

let userId;
let userName;
let signaling;
let pc = {};
let pcSender = {};
let isCallActiveVersion = 0;
const isCallActiveData = {};
let connection_resolvers = [];
let constraints = { audio: true, video: true };
let localStream;
let displayStream;
let roomId = urlParams.get('id');

const uniqueId = () => {
  const dateString = Date.now().toString(36);
  const randomness = Math.random().toString(36).substr(2);
  return dateString + randomness;
};

//Onload
(() => {
  userId = uniqueId();
  nameDialog.showModal();
})()

const handleDataChannelEvent = async (event) => {
  let eventData = event.data;
  if(event.data instanceof Blob){
    eventData = await event.data.text();
  }
  console.log(eventData);
  const { type, data, senderId, peerId, mediaToggle, name, ...rest } = JSON.parse(eventData);
  if (type !== 'checkIsCallStarted' && type !== 'isCallStartedStatus' && type !== 'startCall' && endBtn.style.display == 'none') {
    return;
  }
  switch (type) {
    case "startCall":
      handleIncommingCall();
      break;
    case "callAccept":
      if (screenShareBtn.innerHTML.includes('Stop') && senderId.includes('-screen')) {
        handleScreenShare();
      }
      if (screenShareBtn.innerHTML.includes('Stop') && !pc[senderId + '-screen']) {
        handleAcceptCall(senderId + '-screen', name + "'s Screen");
      }
      handleAcceptCall(senderId, name);
      break;
    case "callReject":
      showNotification(`${data} by ${senderId}`);
      delete pc[userId];
      break;
    case "candidate":
      if (peerId == userId || peerId == userId + '-screen') {
        handleIceCandidate({ ...rest }, senderId);
      }
      break;
    case "offer":
      if (peerId == userId || peerId == userId + '-screen') {
        handleOffer(data, senderId, mediaToggle, name);
      }
      break;
    case "answer":
      if (peerId == userId || peerId == userId + '-screen') {
        handleAnswer(data, senderId);
      }
      break;
    case "checkIsCallStarted":
      handleCheckIsCallStarted(senderId, rest.version);
      break;
    case "isCallStartedStatus":
      if (peerId == userId || peerId == userId + '-screen') {
        if (!isCallActiveData[rest.version]?.length) {
          isCallActiveData[rest.version] = [];
        }
        isCallActiveData[rest.version].push(data);
        const isCallActiveList = isCallActiveData[rest.version]
        handleIsCallStartedStatus(isCallActiveList);
      }
      break;
    case "callEnd":
      if (Object.keys(pc).length) {
        handeleCallEnd(senderId);
      } else if (joinBtn.style.display == 'inline') {
        checkIsCallStarted();
      }
      break;
  }
};

const setupDataChannel = async () => {
  var url = `wss://webrtc-one-to-many-server.onrender.com/?room=${roomId}&streamName=${userId}`

  signaling = new WebSocket(url);

  signaling.addEventListener('open', () => {
    connection_resolvers.forEach(r => r.resolve())
  });
  signaling.onmessage = handleDataChannelEvent;

  // signaling = new BroadcastChannel("webrtc");
  // signaling.onmessage = handleDataChannelEvent;
}

let checkConnection = () => {
  return new Promise((resolve, reject) => {
    if (signaling.readyState === WebSocket.OPEN) {
      resolve();
    }
    else {
      connection_resolvers.push({ resolve, reject });
    }
  });
}

async function send(data) {
  await checkConnection();
  signaling.send(data);
}

function checkIsCallStarted() {
  const message = {
    type: "checkIsCallStarted",
    senderId: userId,
    version: isCallActiveVersion
  };
  send(JSON.stringify(message));
  isCallActiveVersion++;
  setTimeout(() => {
    if (!isCallActiveData[message.version]?.length && endBtn.style.display == "none") {
      startBtn.style.display = 'inline';
    }
  }, 2000);
}

const handleAddName = async (e) => {
  e.preventDefault();
  userName = nameField.value;
  greatting.innerHTML = `Hello ${userName}, wellcome to chatroom`;
  nameDialog.close();
  await getUserMedia();
  setTimeout(() => {
    setupDataChannel();
    checkIsCallStarted();
    greatting.style.display = 'none';
    actionContainer.style.display = 'block';
    userNameEl.innerHTML = userName + " " + userId;
  }, 1000);

}

const showNotification = (messageText) => {
  notificaionMessage.innerText = messageText
  notificationDialog.style.display = 'block';
  setTimeout(() => {
    notificationDialog.style.display = 'none';
  }, 3000);
}

const handeleCallEnd = (id) => {
  pc[id]?.close();
  delete pc[id];
  playerContainer?.removeChild(
    document.getElementById(id + "_player")
  );
}

const conpleteEnd = () => {
  endCall();
  const messages = {
    type: "callEnd",
    data: "Call End",
    senderId: userId + '-screen',
  };
  send(JSON.stringify(messages));
  screenShareBtn.innerHTML = 'Screen Share';
}

const endCall = (obj = pc) => {
  console.log(obj);
  const isScreenShare = Object.keys(obj).length && Object.keys(obj)[0].includes('-screen');
  const messages = {
    type: "callEnd",
    data: "Call End",
    senderId: isScreenShare ? userId + '-screen' : userId,
  };
  send(JSON.stringify(messages));
  for (peer in obj) {
    pc[peer].close();
    delete pc[peer];
  }
  // localStream.getTracks().forEach(track => track.stop());
  // localStream = null;
  displayStream?.getVideoTracks()?.map((track) => {
    track.stop();
  });
  displayStream = null;
  if (!isScreenShare) {
    checkIsCallStarted()
    playerContainer.innerHTML = ''
    endBtn.style.display = 'none';
  }
}

const handleScreenShare = async () => {
  if (!screenShareBtn.innerHTML.includes('Stop')) {
    await getDisplayMedia();
    screenShareBtn.innerHTML = 'Stop Screen Share';
    handleIncommingCallAnswer(true, false, true);
  } else {
    screenShareBtn.innerHTML = 'Screen Share';
    const data = {};
    for (const peer in pc) {
      if (peer.includes('-screen')) {
        data[peer] = pc[peer]
      }
    }
    endCall(data);
  }
};

const handleCheckIsCallStarted = (id, version) => {
  const message = {
    type: "isCallStartedStatus",
    data: false,
    peerId: id,
    version,

  }
  if (Object.keys(pc).length || endBtn.style.display === 'inline') {
    message.data = true;
  }
  send(JSON.stringify(message));
}

const handleIsCallStartedStatus = (isCallActiveList) => {
  if (isCallActiveList.includes(true)) {
    startBtn.style.display = 'none';
    joinBtn.style.display = 'inline';
  } else {
    startBtn.style.display = 'inline';
    joinBtn.style.display = 'none';
  }
}

const joinCall = async () => {
  if (!localStream) {
    await getUserMedia();
  }
  handleIncommingCallAnswer(true)
}

const handleIncommingCall = () => {
  incommingCallDialog.showModal();
}


const handleIncommingCallAnswer = async (answer, join = false, screenShare = false) => {
  if (answer || join) {
    const messages = {
      type: "callAccept",
      data: null,
      senderId: screenShare ? userId + '-screen' : userId,
      name: screenShare ? userName + "'s Screen" : userName
    };
    send(JSON.stringify(messages));
    startBtn.style.display = "none";
    endBtn.style.display = "inline";
    joinBtn.style.display = "none";
  } else {
    const messages = {
      type: "callReject",
      data: "Call Rejected",
      senderId: userId,
    };
    send(JSON.stringify(messages));
    checkIsCallStarted();
  }
  incommingCallDialog.close();
};

const handleAcceptCall = async (id, name) => {
  createPeerConnection(id, name);
  const offer = await pc[id].createOffer();
  await pc[id].setLocalDescription(offer);
  const message = {
    type: "offer",
    data: offer,
    senderId: id.includes('-screen') ? userId + '-screen' : userId,
    peerId: id,
    name: id.includes('-screen') ? userName + "'s Screen" : userName,
  };
  send(JSON.stringify(message));
};

const handleOffer = async (offer, id, mediaToggle, name) => {
  if (pc[id] && !mediaToggle) {
    console.error("existing peerconnection", id, pc);
    delete pc[id]
  }
  if (!mediaToggle) {
    createPeerConnection(id, name);
  }
  await pc[id].setRemoteDescription(offer);

  const answer = await pc[id].createAnswer();
  const message = {
    type: "answer",
    data: answer,
    senderId: id.includes('-screen') ? userId + '-screen' : userId,
    peerId: id
  };
  send(JSON.stringify(message));
  await pc[id].setLocalDescription(answer);
};

const handleAnswer = async (answer, id) => {
  if (!pc) {
    console.error("no peerconnection");
    return;
  }
  await pc[id].setRemoteDescription(answer);
};

const handleRemoveVideoElement = (pc, id, userName) => {
  pc.ontrack = (e) => {
    let video = document.getElementById(id);
    if (video) {
      video.srcObject = e.streams[0]
    } else {
      const player = document.createElement('div');
      const name = document.createElement('h5');
      const vide = document.createElement('video')

      player.id = id + "_player";
      player.style.display = 'flex';
      player.style.flexDirection = 'column';
      player.style.width = '200px'
      player.style.marginRight = '10px'

      name.innerHTML = userName

      vide.id = id
      vide.srcObject = e.streams[0];
      vide.autoplay = true;
      if (id.includes('-screen')) {
        vide.controls = true;
      }

      player.appendChild(vide);
      player.appendChild(name);
      playerContainer.appendChild(player)
    }
  }
}

const createPeerConnection = (id, name) => {
  pc[id] = new RTCPeerConnection(configuration);
  pc[id].onicecandidate = (e) => {
    const message = {
      type: 'candidate',
      candidate: null,
      senderId: id.includes('-screen') ? userId + '-screen' : userId,
      peerId: id
    };
    if (e.candidate) {
      message.candidate = e.candidate.candidate;
      message.sdpMid = e.candidate.sdpMid;
      message.sdpMLineIndex = e.candidate.sdpMLineIndex;
    }
    send(JSON.stringify(message));
  };

  if (displayStream && id.includes('-screen')) {
    displayStream.getTracks().forEach((track) => (pcSender[`${id}_${track.kind}`] = pc[id].addTrack(track, localStream)));
  } else {
    localStream.getTracks().forEach((track) => (pcSender[`${id}_${track.kind}`] = pc[id].addTrack(track, localStream)));
    handleRemoveVideoElement(pc[id], id, name);
  }
};


const startCall = async () => {
  const messages = {
    type: "startCall",
    data: null,
    senderId: userId,
  };
  send(JSON.stringify(messages));
  startBtn.style.display = "none";
  endBtn.style.display = "inline";
};

const handleIceCandidate = async (candidate, id) => {
  id
  if (!pc[id]) {
    console.error("no peerconnection", id, pc);
    return;
  }
  if (!candidate.candidate) {
    await pc[id].addIceCandidate(null);
  } else {
    await pc[id].addIceCandidate(candidate);
  }
};

async function getUserMedia() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream = stream;
    localVideo.srcObject = stream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
  }
}

async function getDisplayMedia() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    displayStream = stream;
    stream.getTracks()[0].onended = () => {
      handleScreenShare();
    };
  } catch (error) {
    console.error("Error accessing media devices:", error);
  }
}

handleLocalStreamToggle = async (type, e) => {
  constraints[type] = !constraints[type];
  if (type == 'video') {
    if (!constraints.video) {
      localStream.getVideoTracks().forEach(el => {
        el?.stop();
        localStream.removeTrack(el);
        removeTrackToPeer(el);
      })
    } else {
      const stream = await navigator?.mediaDevices?.getUserMedia({ video: true });
      const track = stream?.getVideoTracks()[0]
      await localStream.addTrack(track);
      addTrackToPeer(track)
    }
  } else {
    if (!constraints.audio) {
      localStream.getAudioTracks().forEach(el => {
        el?.stop();
        localStream.removeTrack(el);
        removeTrackToPeer(el);
      });
    } else {
      const stream = await navigator?.mediaDevices?.getUserMedia({ audio: true });
      const track = stream?.getAudioTracks()[0]
      await localStream.addTrack(track);
      addTrackToPeer(track)
    }
  }
  e.target.innerText = `Toggle ${type} - ${constraints[type] ? 'off' : 'on'}`;
};

const removeTrackToPeer = async (track) => {
  if (endBtn.style.display == "none") {
    return;
  }
  for (peer in pc) {
    if (!peer.includes('-screen')) {
      pc[peer].removeTrack(pcSender[`${peer}_${track.kind}`]);
      sendUpdatePeerOffer(pc[peer], peer)
    }
  }
}

const addTrackToPeer = async (track) => {
  if (endBtn.style.display == "none") {
    return;
  }
  if (!peer.includes('-screen')) {
    for (peer in pc) {
      pcSender[`${peer}_${track.kind}`] = pc[peer].addTrack(track, localStream);
      sendUpdatePeerOffer(pc[peer], peer)
    }
  }
}

const sendUpdatePeerOffer = async (pc, id) => {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const message = {
    type: "offer",
    data: offer,
    senderId: userId,
    peerId: id,
    mediaToggle: true
  };
  send(JSON.stringify(message));
}


window.onbeforeunload = function () {
  if (endBtn.style.display == "inline") {
    conpleteEnd();
  }
};
