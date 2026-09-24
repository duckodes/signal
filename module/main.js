const missionApiUrl = 'https://getfieldmission-uqj7m73rbq-uc.a.run.app';
const verificationApiUrl = 'https://verifyfieldmission-uqj7m73rbq-uc.a.run.app';

const elements = {
	locationButton: document.querySelector('#location-button'),
	scanButton: document.querySelector('#scan-button'),
	completeButton: document.querySelector('#complete-button'),
	missionProofInput: document.querySelector('#mission-proof-input'),
	cameraModal: document.querySelector('#camera-modal'),
	cameraPreview: document.querySelector('#camera-preview'),
	cameraCanvas: document.querySelector('#camera-canvas'),
	cameraStatus: document.querySelector('#camera-status'),
	cameraCapture: document.querySelector('#camera-capture'),
	cameraFallback: document.querySelector('#camera-fallback'),
	cameraClose: document.querySelector('#camera-close'),
	locationMessage: document.querySelector('#location-message'),
	syncLabel: document.querySelector('#sync-label'),
	coordinates: document.querySelector('#coordinates'),
	radarEmpty: document.querySelector('#radar-empty'),
	radarStage: document.querySelector('#radar-stage'),
	missionState: document.querySelector('#mission-state'),
	missionContent: document.querySelector('#mission-content'),
	missionCount: document.querySelector('#mission-count'),
	missionType: document.querySelector('#mission-type'),
	missionTitle: document.querySelector('#mission-title'),
	missionDescription: document.querySelector('#mission-description'),
	missionDistance: document.querySelector('#mission-distance'),
	missionProgress: document.querySelector('#mission-progress'),
	progressBar: document.querySelector('#mission-progress-bar'),
	rewardValue: document.querySelector('#reward-value'),
	completedCount: document.querySelector('#completed-count'),
	distanceCount: document.querySelector('#distance-count'),
	xpCount: document.querySelector('#xp-count'),
	toast: document.querySelector('#toast')
	, verificationNote: document.querySelector('#verification-note')
	, mapCanvas: document.querySelector('#map-canvas')
	, nearbyPlaces: document.querySelector('#nearby-places')
	, mapStatus: document.querySelector('#map-status')
	, mapCoordinates: document.querySelector('#map-coordinates')
	, placesList: document.querySelector('#places-list')
	, routeStatus: document.querySelector('#route-status')
	, routeDistance: document.querySelector('#route-distance')
	, routeTime: document.querySelector('#route-time')
	, navigateButton: document.querySelector('#navigate-button')
	, recenterButton: document.querySelector('#recenter-button')
	, navigationOverlay: document.querySelector('#navigation-overlay')
	, navigationDistance: document.querySelector('#navigation-distance')
	, navigationManeuver: document.querySelector('#navigation-maneuver')
	, navigationDirection: document.querySelector('#navigation-direction')
};

const state = {
	position: null,
	mission: null,
	completed: 0,
	distance: 0,
	xp: 0,
	map: null,
	userMarker: null,
	missionMarker: null,
	routeLine: null,
	navigationWatchId: null,
	navigationArrow: null,
	navigationActive: false,
	navigationCenterOnUser: false,
	heading: null,
	headingSource: 'none',
	manualPan: false,
	panStart: null,
	recenterTimer: null,
	scanTimer: null,
	toastTimer: null
	, locationRetry: false
	, seenMissionTitles: []
	, cameraStream: null
};

function formatCoordinate(value, positive, negative) {
	const direction = value >= 0 ? positive : negative;
	return `${Math.abs(value).toFixed(4)}° ${direction}`;
}

function destinationPoint(latitude, longitude, distance, bearing) {
	const earthRadius = 6371000;
	const angularDistance = distance / earthRadius;
	const bearingRadians = bearing * Math.PI / 180;
	const latitudeRadians = latitude * Math.PI / 180;
	const longitudeRadians = longitude * Math.PI / 180;
	const targetLatitude = Math.asin(Math.sin(latitudeRadians) * Math.cos(angularDistance) + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians));
	const targetLongitude = longitudeRadians + Math.atan2(Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians), Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(targetLatitude));
	return { latitude: targetLatitude * 180 / Math.PI, longitude: targetLongitude * 180 / Math.PI };
}

function distanceBetween(first, second) {
	const earthRadius = 6371000;
	const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180;
	const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180;
	const latitudeOne = first.latitude * Math.PI / 180;
	const latitudeTwo = second.latitude * Math.PI / 180;
	const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2;
	return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function bearingBetween(first, second) {
	const latitudeOne = first.latitude * Math.PI / 180;
	const latitudeTwo = second.latitude * Math.PI / 180;
	const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180;
	const y = Math.sin(longitudeDelta) * Math.cos(latitudeTwo);
	const x = Math.cos(latitudeOne) * Math.sin(latitudeTwo) - Math.sin(latitudeOne) * Math.cos(latitudeTwo) * Math.cos(longitudeDelta);
	return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function directionLabel(degrees) {
	return ['北方', '東北方', '東方', '東南方', '南方', '西南方', '西方', '西北方'][Math.round(degrees / 45) % 8];
}

function maneuverLabel(relativeBearing) {
	const degrees = Math.abs(relativeBearing);
	if (degrees <= 12) return '直走';
	if (degrees <= 35) return relativeBearing < 0 ? '微偏左' : '微偏右';
	if (degrees <= 110) return relativeBearing < 0 ? '左轉' : '右轉';
	return '掉頭';
}

function updateScanPosition() {
	if (!state.map || !state.position) return;
	const point = state.map.latLngToContainerPoint([state.position.coords.latitude, state.position.coords.longitude]);
	elements.radarStage.style.setProperty('--scan-x', `${point.x}px`);
	elements.radarStage.style.setProperty('--scan-y', `${point.y}px`);
}

function updateNavigation(position, keepCenteredView = false) {
	state.position = position;
	const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
	const target = state.mission.target;
	const remaining = distanceBetween(current, target);
	const targetBearing = bearingBetween(current, target);
	if (Number.isFinite(position.coords.heading) && position.coords.speed > 0.5) {
		state.heading = position.coords.heading;
		state.headingSource = 'gps';
	}
	const displayBearing = state.heading ?? targetBearing;
	const relativeBearing = (targetBearing - displayBearing + 540) % 360 - 180;
	elements.mapCanvas.style.setProperty('--map-heading', `${-displayBearing}deg`);
	if (state.userMarker) state.userMarker.setLatLng([current.latitude, current.longitude]);
	if (state.navigationArrow) state.navigationArrow.setLatLng([current.latitude, current.longitude]);
	if (state.navigationArrow?.setIcon) state.navigationArrow.setIcon(window.L.divIcon({ className: 'navigation-arrow', html: `<span style="transform: rotate(${displayBearing}deg)"></span>`, iconSize: [42, 42], iconAnchor: [21, 21] }));
	if (state.navigationActive && state.map && !state.manualPan && !keepCenteredView) {
		state.map.setView([current.latitude, current.longitude], 18, { animate: false });
	}
	updateScanPosition();
	elements.navigationDistance.textContent = `${Math.round(remaining)} m`;
	elements.navigationManeuver.textContent = maneuverLabel(relativeBearing);
	elements.navigationManeuver.dataset.turn = relativeBearing < -12 ? 'left' : relativeBearing > 12 ? 'right' : 'straight';
	elements.navigationDirection.textContent = `${directionLabel(targetBearing)} / ${Math.abs(Math.round(relativeBearing))}°`;
}

function navigationPointerDown(event) {
	if (!state.navigationActive || event.button > 0) return;
	elements.mapCanvas.setPointerCapture(event.pointerId);
	state.panStart = { x: event.clientX, y: event.clientY };
	state.manualPan = true;
	window.clearTimeout(state.recenterTimer);
}

function navigationPointerMove(event) {
	if (!state.navigationActive || !state.panStart || !state.map) return;
	const screenX = event.clientX - state.panStart.x;
	const screenY = event.clientY - state.panStart.y;
	const current = state.position?.coords;
	const fallbackHeading = current && state.mission?.target
		? bearingBetween(current, state.mission.target)
		: 0;
	const headingRadians = (state.heading ?? fallbackHeading) * Math.PI / 180;
	const mapX = screenX * Math.cos(headingRadians) - screenY * Math.sin(headingRadians);
	const mapY = screenX * Math.sin(headingRadians) + screenY * Math.cos(headingRadians);
	state.map.panBy([-mapX, -mapY], { animate: false });
	state.panStart = { x: event.clientX, y: event.clientY };
}

function navigationPointerUp(event) {
	if (!state.panStart) return;
	if (elements.mapCanvas.hasPointerCapture(event.pointerId)) elements.mapCanvas.releasePointerCapture(event.pointerId);
	state.panStart = null;
	state.recenterTimer = window.setTimeout(() => {
		state.manualPan = false;
		if (state.position) {
			centerMapOnPosition(state.position, 18);
			updateNavigation(state.position, true);
		}
	}, 3500);
}

function handleOrientation(event) {
	if (typeof event.alpha !== 'number') return;
	const compassHeading = event.webkitCompassHeading;
	state.heading = Number.isFinite(compassHeading) ? compassHeading : (360 - event.alpha + 360) % 360;
	state.headingSource = 'compass';
	if (state.position && state.navigationActive) updateNavigation(state.position);
}

async function enableOrientation() {
	if (typeof window.DeviceOrientationEvent?.requestPermission !== 'function') return true;
	try {
		return await window.DeviceOrientationEvent.requestPermission() === 'granted';
	} catch {
		return false;
	}
}

async function toggleNavigation() {
	if (!state.mission || !state.position || !state.map) return;
	state.navigationActive = !state.navigationActive;
	if (state.navigationActive) {
		state.navigationCenterOnUser = true;
		await enableOrientation();
		state.map.dragging.disable();
		elements.mapCanvas.addEventListener('pointerdown', navigationPointerDown);
		elements.mapCanvas.addEventListener('pointermove', navigationPointerMove);
		elements.mapCanvas.addEventListener('pointerup', navigationPointerUp);
		elements.mapCanvas.addEventListener('pointercancel', navigationPointerUp);
		state.navigationWatchId = navigator.geolocation.watchPosition(updateNavigation, handleLocationError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
		if (state.userMarker) state.userMarker.setStyle({ opacity: 0, fillOpacity: 0 });
		state.navigationArrow = window.L.marker([state.position.coords.latitude, state.position.coords.longitude], { icon: window.L.divIcon({ className: 'navigation-arrow', html: '<span></span>', iconSize: [42, 42], iconAnchor: [21, 21] }) }).addTo(state.map);
		elements.navigationOverlay.classList.remove('is-hidden');
		elements.navigateButton.classList.add('is-active');
		elements.navigateButton.innerHTML = '<span class="button-icon">■</span> 結束導航';
		elements.radarStage.classList.add('is-navigation');
		centerMapOnPosition(state.position, 18);
		window.addEventListener('deviceorientation', handleOrientation, true);
		window.addEventListener('deviceorientationabsolute', handleOrientation, true);
		updateNavigation(state.position, true);
		showToast('導航已啟動，藍色箭頭會持續指向訊號點。');
	} else {
		state.map.dragging.enable();
		window.clearTimeout(state.recenterTimer);
		state.manualPan = false;
		state.panStart = null;
		elements.mapCanvas.removeEventListener('pointerdown', navigationPointerDown);
		elements.mapCanvas.removeEventListener('pointermove', navigationPointerMove);
		elements.mapCanvas.removeEventListener('pointerup', navigationPointerUp);
		elements.mapCanvas.removeEventListener('pointercancel', navigationPointerUp);
		navigator.geolocation.clearWatch(state.navigationWatchId);
		state.navigationWatchId = null;
		if (state.navigationArrow) { state.navigationArrow.remove(); state.navigationArrow = null; }
		if (state.userMarker) state.userMarker.setStyle({ opacity: 1, fillOpacity: 1 });
		elements.navigationOverlay.classList.add('is-hidden');
		elements.navigateButton.classList.remove('is-active');
		elements.navigateButton.innerHTML = '<span class="button-icon">➤</span> 開始導航';
		elements.radarStage.classList.remove('is-navigation');
		elements.mapCanvas.style.setProperty('--map-heading', '0deg');
		state.navigationCenterOnUser = false;
		window.removeEventListener('deviceorientation', handleOrientation, true);
		window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
		state.heading = null;
		state.headingSource = 'none';
	}
}

function recenterMap() {
	if (!state.position || !state.map) return;
	state.manualPan = false;
	state.navigationCenterOnUser = state.navigationActive;
	window.clearTimeout(state.recenterTimer);
	if (state.navigationActive) {
		centerMapOnPosition(state.position, 18);
		updateNavigation(state.position, true);
	}
	else centerMapOnPosition(state.position, 16);
	showToast('已回到目前位置。');
}

function centerMapOnPosition(position, zoom) {
	if (!state.map || !position) return;
	const { latitude, longitude } = position.coords;
	state.map.stop();
	state.map.invalidateSize({ pan: false, animate: false });
	state.map.setView([latitude, longitude], zoom, {
		animate: true,
		duration: 0.7
	});
}

function createMap(latitude, longitude) {
	if (!window.L) {
		elements.mapStatus.textContent = '地圖程式庫無法載入，定位與任務驗證仍可使用。';
		elements.mapStatus.classList.remove('is-hidden');
		return;
	}
	if (!state.map) {
		state.map = window.L.map(elements.mapCanvas, { zoomControl: false }).setView([latitude, longitude], 15);
		state.map.on('move zoom', updateScanPosition);
		window.L.control.zoom({ position: 'bottomright' }).addTo(state.map);
		window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: 19
		}).addTo(state.map).on('tileerror', () => {
			elements.mapStatus.textContent = '道路圖暫時無法載入，定位與任務驗證仍可使用。';
			elements.mapStatus.classList.remove('is-hidden');
		});
	} else {
		state.map.setView([latitude, longitude], 16);
	}
	if (state.userMarker) state.userMarker.setLatLng([latitude, longitude]);
	else state.userMarker = window.L.circleMarker([latitude, longitude], { radius: 8, color: '#00f6ff', fillColor: '#04121e', fillOpacity: 1, weight: 3, className: 'user-location-node' }).addTo(state.map).bindTooltip('你在這裡', { direction: 'top' });
}

async function loadNearbyPlaces(latitude, longitude) {
	const query = `[out:json][timeout:8];(nwr["name"](around:800,${latitude},${longitude}););out center tags 20;`;
	try {
		const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
		if (!response.ok) throw new Error('POI request failed');
		const data = await response.json();
		const places = data.elements.filter(item => item.tags?.name).slice(0, 5);
		elements.placesList.innerHTML = places.length
			? places.map(place => `<span class="place-item">${place.tags.name}</span>`).join('')
			: '<span class="place-item">附近暫無公開地標資料</span>';
		elements.nearbyPlaces.classList.remove('is-hidden');
		places.forEach(place => {
			const placeLatitude = place.lat ?? place.center?.lat;
			const placeLongitude = place.lon ?? place.center?.lon;
			if (placeLatitude && placeLongitude && state.map) window.L.circleMarker([placeLatitude, placeLongitude], { radius: 4, color: '#ff4bc8', fillColor: '#ff4bc8', fillOpacity: .9, weight: 1, className: 'nearby-place-node' }).addTo(state.map).bindTooltip(place.tags.name);
		});
	} catch {
		elements.placesList.innerHTML = '<span class="place-item">地標資料暫時無法載入</span>';
		elements.nearbyPlaces.classList.remove('is-hidden');
	}
}

async function planRoute(mission) {
	if (!state.map || !state.position) return;
	const start = state.position.coords;
	const endpoint = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${start.longitude},${start.latitude};${mission.target.longitude},${mission.target.latitude}?overview=full&geometries=geojson`;
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), 4000);
	elements.routeStatus.textContent = '正在連線';
	try {
		const response = await fetch(endpoint, { signal: controller.signal });
		if (!response.ok) throw new Error('Route request failed');
		const data = await response.json();
		const route = data.routes?.[0];
		if (!route) throw new Error('No route found');
		if (state.routeLine) state.routeLine.remove();
		const points = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
		state.routeLine = window.L.polyline(points, { color: '#00f6ff', weight: 4, opacity: .92, className: 'navigation-route' }).addTo(state.map);
		state.map.fitBounds(state.routeLine.getBounds(), { padding: [42, 42], maxZoom: 17 });
		elements.routeStatus.textContent = '路徑已鎖定';
		elements.routeDistance.textContent = `${Math.round(route.distance)} m`;
		elements.routeTime.textContent = `${Math.max(1, Math.round(route.duration / 60))} min`;
	} catch {
		if (state.routeLine) state.routeLine.remove();
		state.routeLine = window.L.polyline([[start.latitude, start.longitude], [mission.target.latitude, mission.target.longitude]], { color: '#ff4bc8', weight: 3, dashArray: '7 9', opacity: .9, className: 'navigation-route navigation-route--fallback' }).addTo(state.map);
		state.map.fitBounds(state.routeLine.getBounds(), { padding: [42, 42], maxZoom: 17 });
		elements.routeStatus.textContent = '直線導引';
		elements.routeDistance.textContent = `${mission.distance} m`;
		elements.routeTime.textContent = '約 2 min';
	} finally {
		window.clearTimeout(timeoutId);
	}
}

function updatePosition(position) {
	const { latitude, longitude } = position.coords;
	state.position = position;
	createMap(latitude, longitude);
	updateScanPosition();
	loadNearbyPlaces(latitude, longitude);
	elements.coordinates.innerHTML = `
		<span class="coordinate-value">${formatCoordinate(latitude, 'N', 'S')} / ${formatCoordinate(longitude, 'E', 'W')}</span>
		<span class="coordinate-label">LAT / LONG</span>`;
	elements.mapCoordinates.textContent = `GPS // ${latitude.toFixed(4)}N / ${longitude.toFixed(4)}E`;
	elements.radarEmpty.classList.add('is-hidden');
	elements.radarStage.classList.add('is-active');
	elements.locationButton.innerHTML = '<span class="button-icon">✓</span> 定位已開啟';
	elements.locationButton.classList.add('is-connected');
	elements.locationMessage.textContent = '位置已鎖定。現在可以探測附近的未知訊號。';
	elements.syncLabel.textContent = '定位已同步';
	elements.scanButton.disabled = false;
	elements.recenterButton.disabled = false;
	if (state.mission) elements.navigateButton.disabled = false;
}

function handleLocationError(error) {
	if ((error.code === 2 || error.code === 3) && !state.locationRetry) {
		state.locationRetry = true;
		elements.locationMessage.textContent = '高精度定位沒有回應，正在改用手機定位重試...';
		navigator.geolocation.getCurrentPosition(updatePosition, finalLocationError, {
			enableHighAccuracy: false,
			timeout: 20000,
			maximumAge: 60000
		});
		return;
	}
	finalLocationError(error);
}

function finalLocationError(error) {
	state.locationRetry = false;
	const message = error.code === 1
		? '定位權限被拒絕，請到 iPhone「設定 > 隱私權與安全性 > 定位服務 > Chrome」允許使用期間。'
		: error.code === 3
			? '定位逾時。請確認手機定位服務已開啟，並在 HTTPS 或 localhost 網址使用。'
			: '手機暫時無法取得 GPS。請確認定位服務已開啟，並移到戶外或靠近窗邊再試。';
	elements.locationButton.disabled = false;
	elements.locationButton.innerHTML = '<span class="button-icon">⌖</span> 重試定位';
	elements.locationMessage.textContent = message;
	elements.syncLabel.textContent = '需要定位';
	showToast(message, 'error');
}

function requestLocation() {
	if (!navigator.geolocation) {
		finalLocationError({ code: 2 });
		return;
	}
	if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
		finalLocationError({ code: 3 });
		return;
	}

	state.locationRetry = false;
	elements.locationButton.disabled = true;
	elements.locationButton.innerHTML = '<span class="loader"></span> 正在取得位置';
	navigator.geolocation.getCurrentPosition(updatePosition, handleLocationError, {
		enableHighAccuracy: true,
		timeout: 12000,
		maximumAge: 0
	});
}

async function scanSignal() {
	if (!state.position || elements.scanButton.classList.contains('is-scanning')) return;

	elements.scanButton.classList.add('is-scanning');
	elements.scanButton.innerHTML = '<span class="loader"></span> 掃描中...';
	elements.syncLabel.textContent = '正在掃描附近任務';
	elements.radarStage.classList.add('is-scanning');
	try {
		const response = await fetch(missionApiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				latitude: state.position.coords.latitude,
				longitude: state.position.coords.longitude,
				excludeTitles: state.seenMissionTitles
			})
		});
		if (!response.ok) throw new Error('mission request failed');
		const mission = await response.json();
		state.mission = mission;
		if (mission.title && !state.seenMissionTitles.includes(mission.title)) {
			state.seenMissionTitles.push(mission.title);
		}
		elements.missionState.classList.add('is-hidden');
		elements.missionContent.classList.remove('is-hidden');
		elements.missionCount.textContent = 'SIGNAL FOUND';
		elements.missionCount.classList.add('is-found');
		elements.missionType.textContent = mission.type;
		elements.missionTitle.textContent = mission.title;
		elements.missionDescription.textContent = `${mission.description}（${mission.proofPrompt}）`;
		elements.missionDistance.textContent = `距離你 ${mission.distance} m`;
		if (state.map) {
			if (state.missionMarker) state.missionMarker.remove();
			state.missionMarker = window.L.marker([mission.target.latitude, mission.target.longitude], { icon: window.L.divIcon({ className: 'mission-node', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(state.map).bindTooltip('訊號點', { permanent: true, direction: 'top' });
			state.map.fitBounds([[state.position.coords.latitude, state.position.coords.longitude], [mission.target.latitude, mission.target.longitude]], { padding: [30, 30] });
			planRoute(mission);
		}
		elements.verificationNote.textContent = `請前往 ${mission.placeName} 附近（${mission.distance} m 內），抵達後拍照驗證。`;
		elements.rewardValue.textContent = `+ ${mission.reward} XP`;
		elements.completeButton.disabled = false;
		elements.completeButton.innerHTML = '拍照並驗證任務 <span>⌖</span>';
		elements.navigateButton.disabled = false;
		elements.scanButton.classList.remove('is-scanning');
		elements.scanButton.innerHTML = '<span class="button-icon">↻</span> 重新探測';
		elements.syncLabel.textContent = '訊號已鎖定';
		elements.radarStage.classList.remove('is-scanning');
		showToast('發現新訊號，任務已解鎖。');
	} catch {
		elements.scanButton.classList.remove('is-scanning');
		elements.scanButton.innerHTML = '<span class="button-icon">⌁</span> 探測訊號';
		elements.radarStage.classList.remove('is-scanning');
		elements.syncLabel.textContent = '任務服務暫時離線';
		showToast('附近任務暫時無法取得，請稍後再試。', 'error');
	}
}

function readImageAsDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

async function verifyMissionPhoto(file) {
	if (!state.mission || !navigator.geolocation) return;
	elements.completeButton.disabled = true;
	elements.completeButton.innerHTML = '<span class="loader"></span> AI 正在判斷照片';
	navigator.geolocation.getCurrentPosition(position => {
		const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
		const distance = distanceBetween(current, state.mission.target);
		if (distance > 60) {
			elements.completeButton.disabled = false;
			elements.completeButton.innerHTML = '拍照並驗證任務 <span>⌖</span>';
			elements.verificationNote.textContent = `尚未抵達訊號點，目前還有 ${Math.round(distance)} m。`;
			showToast(`還差 ${Math.round(distance)} m，請繼續前往訊號點。`, 'error');
			return;
		}
		readImageAsDataUrl(file).then(image => fetch(verificationApiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mission: state.mission, image })
		})).then(response => {
			if (!response.ok) throw new Error('verification request failed');
			return response.json();
		}).then(result => {
			if (!result.completed) throw new Error(result.feedback || '照片未通過判定');
			state.completed += 1;
			state.distance += state.mission.distance / 1000;
			state.xp += state.mission.reward;
			elements.completedCount.textContent = String(state.completed).padStart(2, '0');
			elements.distanceCount.textContent = state.distance.toFixed(1);
			elements.xpCount.textContent = String(state.xp).padStart(3, '0');
			elements.missionProgress.textContent = '1 / 1';
			elements.progressBar.style.width = '100%';
			elements.completeButton.innerHTML = '任務完成 <span>✓</span>';
			elements.verificationNote.textContent = result.feedback;
			showToast(`任務完成，已獲得 ${state.mission.reward} XP。`);
		}).catch(error => {
			elements.completeButton.disabled = false;
			elements.completeButton.innerHTML = '拍照並驗證任務 <span>⌖</span>';
			elements.verificationNote.textContent = error.message;
			showToast(error.message, 'error');
		});
	}, handleLocationError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function completeMission() {
	if (!state.mission || elements.completeButton.disabled) return;
	openCamera();
}

function stopCamera() {
	if (state.cameraStream) {
		state.cameraStream.getTracks().forEach(track => track.stop());
		state.cameraStream = null;
	}
	elements.cameraPreview.srcObject = null;
	elements.cameraCapture.disabled = true;
}

function closeCamera() {
	stopCamera();
	elements.cameraModal.classList.add('is-hidden');
}

async function openCamera() {
	elements.cameraModal.classList.remove('is-hidden');
	elements.cameraStatus.textContent = '正在啟動相機...';
	try {
		if (!navigator.mediaDevices?.getUserMedia) throw new Error('此瀏覽器不支援頁面相機');
		state.cameraStream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
			audio: false
		});
		elements.cameraPreview.srcObject = state.cameraStream;
		await elements.cameraPreview.play();
		elements.cameraStatus.textContent = '確認畫面後拍攝任務證明';
		elements.cameraCapture.disabled = false;
	} catch (error) {
		elements.cameraStatus.textContent = '無法開啟頁面相機，請改用選擇照片。';
		showToast('相機權限被拒絕或目前環境不支援，已提供照片上傳。', 'error');
	}
}

function captureCameraPhoto() {
	if (!state.cameraStream || !elements.cameraPreview.videoWidth) return;
	const canvas = elements.cameraCanvas;
	canvas.width = elements.cameraPreview.videoWidth;
	canvas.height = elements.cameraPreview.videoHeight;
	canvas.getContext('2d').drawImage(elements.cameraPreview, 0, 0, canvas.width, canvas.height);
	canvas.toBlob(blob => {
		if (!blob) return;
		closeCamera();
		verifyMissionPhoto(new File([blob], 'mission-proof.jpg', { type: 'image/jpeg' }));
	}, 'image/jpeg', .88);
}

function showToast(message, type = 'success') {
	window.clearTimeout(state.toastTimer);
	elements.toast.textContent = message;
	elements.toast.className = `toast is-visible ${type === 'error' ? 'is-error' : ''}`;
	state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 4000);
}

elements.locationButton.addEventListener('click', requestLocation);
elements.scanButton.addEventListener('click', scanSignal);
elements.completeButton.addEventListener('click', completeMission);
elements.cameraCapture.addEventListener('click', captureCameraPhoto);
elements.cameraClose.addEventListener('click', closeCamera);
elements.cameraFallback.addEventListener('click', () => elements.missionProofInput.click());
elements.missionProofInput.addEventListener('change', event => {
	const [file] = event.target.files;
	if (file) {
		closeCamera();
		verifyMissionPhoto(file);
	}
	event.target.value = '';
});
elements.navigateButton.addEventListener('click', toggleNavigation);
elements.recenterButton.addEventListener('click', recenterMap);
