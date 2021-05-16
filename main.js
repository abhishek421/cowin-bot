var apiStates = "https://cdn-api.co-vin.in/api/v2/admin/location/states"
var apiDistricts = (stateId) => (`https://cdn-api.co-vin.in/api/v2/admin/location/districts/${stateId}`)
var apiSlotsByDistrict = (districtId) => (`https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${districtId}&date=${formatDate()}:${cacheCoefficient()}`)
var apiSlotsByZip = (zipCode) => (`https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin?pincode=${zipCode}&date=${formatDate()}:${cacheCoefficient()}`)

var conf = { districtOrZip: "district", zipCodes: [], ageGroup: '', brand: '', cost: '' }
var inputHandlers = {}
var stateSelector = document.getElementById("stateSelector")
var districtSelector = document.getElementById("districtSelector")
var zipCodeInput = document.getElementById("zipCodeInput")
var soundToggle = document.getElementById("soundToggle")
var backgroundToggle = document.getElementById("backgroundToggle")
var availableSlotsTBody = document.getElementById("availableSlots")
var bookedSlotsTBody = document.getElementById("bookedSlots")
var infoSlotsTBody = document.getElementById("infoSlots")
var availableSlots = []
var bookedSlots = []
var totalSlots, totalCenters
var interval = 5 * 1000
var intervalRunner
var audioFake = { play: () => false }
var audioReal; // init later when needed
var audio = audioFake;
var windowActive = true;
var notification;

// NOTE: THIS VALUE CHANGES ONLY ONCE IN FIVE SECONDS
// FOR ANYBODY POLLING THE COWIN APIS, I RECOMMEND
// USING THIS COEFFICIENT LOGIC SO THAT WE ALL ARE IN SYNC
// & EACH UNIQUE REQUEST FROM EACH CLIENT DOESN'T BOMBARD THE SERVER.
function cacheCoefficient() {
	var d = Date.now() / 1000
	return d - d % 5
}

function loadDistricts(cb) {
	req(apiDistricts(stateSelector.value), (s, b) => {
		if (s != 200) return;

		districtSelector.innerHTML = `<option value=""> -- select state -- </option>`
		b.districts.forEach(s => {
			districtSelector.add(new Option(s.district_name, s.district_id))
		})

		if (cb) cb()
	})
}

stateSelector.addEventListener('change', (e) => {
	if (!stateSelector.value) return;

	conf.stateId = stateSelector.value
	loadDistricts()
})

districtSelector.addEventListener('change', (e) => {
	if (!districtSelector.value) return;

	conf.districtId = districtSelector.value
	findSlots()
})

zipCodeInput.addEventListener('input', (e) => {
	conf.zipCodes = zipCodeInput.value.replace(/ +/g, '').split(",").filter(z => (!!z))
	renderSlots()
})

inputHandlers.districtOrZip = function (e) {
	conf.districtOrZip = e.target.value
	if (e.target.value == "zip") {
		setHidden(".districtFields", true)
		setHidden(".zipFields", false)
	} else {
		setHidden(".districtFields", false)
		setHidden(".zipFields", true)
	}
	findSlots()
}

inputHandlers.ageGroup = function (e) {
	conf.ageGroup = e.target.value * 1
	renderSlots()
}

inputHandlers.brand = function (e) {
	conf.brand = e.target.value
	renderSlots()
}

inputHandlers.cost = function (e) {
	conf.cost = e.target.value
	renderSlots()
}

soundToggle.addEventListener('change', (e) => {
	// because some browsers need user to interact while playing the audio for the first time
	if (e.target.checked) {
		if (!audioReal) audioReal = new Audio("notification.mp3");

		backgroundToggle.checked = true
		backgroundToggle.disabled = false
		audio = audioReal
	} else {
		backgroundToggle.checked = false
		backgroundToggle.disabled = true
		audio = audioFake
	}
	audio.play()
})

function setHidden(q, hidden) {
	document.querySelectorAll(q).forEach(
		el => (el.hidden = hidden)
	)
}

function req(api, cb) {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function () {
		if (this.readyState != 4) return;
		var data = this.responseText
		try { data = JSON.parse(this.responseText) } catch (e) { }
		cb(this.status, data)
	};

	xhttp.open("GET", api, true);
	xhttp.send();
}

function pad(n, p) {
	n = n + ""
	while (n.length < p) {
		n = "0" + n
	}
	return n
}

function formatDate(date) {
	if (!date) {
		date = new Date();
	}

	return `${pad(date.getDate(), 2)}-${pad(date.getMonth() + 1, 2)}-${date.getYear() + 1900}`
}

function parseDate(d) {
	return new Date(d.split("-").reverse().join("-"))
}

function findSlots() {
	var url;
	// if (conf.districtOrZip == "zip") {
	// 	if (!zipCodeInput.value || zipCodeInput.value.length < 6) return;
	// 	url = apiSlotsByZip(zipCodeInput.value)
	// } else {
	if (!districtSelector.value) return;
	url = apiSlotsByDistrict(districtSelector.value)
	// }

	setHidden("#loader", false)
	req(url, (status, data) => {
		setHidden("#loader", true)
		if (status != 200 || !data || !data.centers) return;

		availableSlots = []
		bookedSlots = []
		totalSlots = 0
		data.centers.forEach(c => {
			if (!c.sessions) return;
			c.sessions.forEach(s => {
				s.available_capacity = Math.floor(s.available_capacity)
				if (s.available_capacity > 0) {
					availableSlots.push({ session: s, center: c })
					totalSlots += s.available_capacity
				} else {
					bookedSlots.push({ session: s, center: c })
				}
			})
		})

		totalCenters = data.centers.length

		// sort by capacity
		availableSlots.sort((a, b) => {
			return b.session.available_capacity - a.session.available_capacity
		})

		// sort by date
		bookedSlots.sort((a, b) => {
			aDate = parseDate(a.session.date)
			bDate = parseDate(b.session.date)
			return (aDate < bDate) ? -1 : (aDate > bDate ? 1 : 0);
		})

		renderSlots();
	})
}

function renderSlots() {
	availableSlotsTBody.innerHTML = ""
	bookedSlotsTBody.innerHTML = ""

	var filteredTotalCenters = []
	var filteredTotalSlots = 0
	availableSlots.concat(bookedSlots).forEach(slotData => {
		if (conf.ageGroup && conf.ageGroup != slotData.session.min_age_limit) return;
		if (conf.brand && conf.brand != slotData.session.vaccine) return;
		if (conf.cost && conf.cost != slotData.center.fee_type) return;
		if (conf.zipCodes && conf.zipCodes.length > 0 && conf.zipCodes.indexOf(slotData.center.pincode + "") == -1) return;

		var tbodyElem = slotData.session.available_capacity ? availableSlotsTBody : bookedSlotsTBody;
		var newRow = tbodyElem.insertRow();
		newRow.insertCell().innerHTML = slotData.session.available_capacity ? slotData.session.available_capacity : "NA";
		newRow.insertCell().innerHTML = slotData.session.date;
		newRow.insertCell().innerHTML = `${slotData.center.name}<br><small class="text-muted">${slotData.center.pincode} | ${slotData.center.address}</small>`;
		newRow.insertCell().innerHTML = `${slotData.session.min_age_limit}yr+`;
		newRow.insertCell().innerHTML = slotData.session.vaccine;
		newRow.insertCell().innerHTML = slotData.center.fee_type;

		if (filteredTotalCenters.indexOf(slotData.center.center_id) == -1) filteredTotalCenters.push(slotData.center.center_id);
		filteredTotalSlots += slotData.session.available_capacity;
	})

	infoSlotsTBody.hidden = (filteredTotalSlots > 0)

	document.getElementById("summary").innerText = `Centers: ${filteredTotalCenters.length} | Available vaccines: ${filteredTotalSlots}`;

	if (filteredTotalSlots > 0) {
		audio.play();
		// notifyUser(`${filteredTotalSlots} Vaccine slots found!`, `Book on cowin.gov.in before it's gone`)
	}

	saveConfig();
}

function saveConfig() {
	localStorage.setItem("defaultConfig", JSON.stringify(conf))
}

function loadConfig() {
	var defaultConfig = localStorage.getItem("defaultConfig")
	if (!defaultConfig) return;

	defaultConfig = JSON.parse(defaultConfig);

	conf = defaultConfig || {}
	stateSelector.value = conf.stateId
	if (!conf.stateId) return;
	loadDistricts(() => {
		if (!conf.districtId) return;
		districtSelector.value = conf.districtId
		if (conf.zipCodes && conf.zipCodes instanceof Array) zipCodeInput.value = conf.zipCodes.join(",")
		document.querySelectorAll(`input[type=radio][name=ageGroup][value="${conf.ageGroup || '0'}"]`)[0].checked = true
		document.querySelectorAll(`input[type=radio][name=brand][value="${conf.brand || ''}"]`)[0].checked = true
		document.querySelectorAll(`input[type=radio][name=cost][value="${conf.cost || ''}"]`)[0].checked = true

		findSlots()
	})
}

function startWatcher() {
	setHidden("#offlineIndicator", true)
	setHidden("#liveIndicator", false)

	findSlots()
	window.clearInterval(intervalRunner)
	intervalRunner = window.setInterval(() => {
		findSlots()
	}, interval);
}

function notifyUser(title, body) {
	if (windowActive) return;

	if (!("Notification" in window)) {
		return;
	}

	else if (Notification.permission === "granted") {
		if (!title) return;
		if (notification) notification.close()
		notification = new Notification(title, {body});
	}
}

document.querySelectorAll('input[type=radio]').forEach(
	input => input.addEventListener('change', inputHandlers[input.name])
);

req(apiStates, (status, body) => {
	if (status != 200) return;
	var states = body["states"]

	stateSelector.innerHTML = `<option value=""> -- select state -- </option>`
	states.forEach(s => {
		stateSelector.add(new Option(s.state_name, s.state_id))
	})
	loadConfig()
})

window.addEventListener('focus', () => {
	windowActive = true;
	startWatcher();
});
startWatcher()

window.addEventListener('blur', () => {
	windowActive = false;
	if (backgroundToggle.checked) return; // keep running the watcher

	setHidden("#offlineIndicator", false)
	setHidden("#liveIndicator", true)

	window.clearInterval(intervalRunner)
});
