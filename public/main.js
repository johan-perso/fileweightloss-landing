window.onerror = async function(error){
	console.error("(Error Grabber) Grabbed: ", error)
	console.error("(Error Grabber) document.readyState ==", document.readyState)

	if(document.readyState !='complete'){
		console.log("(Error Grabber) Page not loaded yet, waiting for it to load")
		await new Promise(resolve => {
			window.addEventListener('load', resolve)
		})
		console.log("(Error Grabber) Page is now loaded, showing error message on loader")
	}

	if(document.getElementById('loader__error')){
		document.getElementById('loader__error').innerText = error.message || error.stack || error
		document.getElementById('loader__error').classList.remove('hidden')
	} else {
		console.log("(Error Grabber) Loader isn't present on page.")
	}
}

var translations
var modalShown = false
var isLoadingPage = true
var isFetchingVersions = false
var autoloadVideos = true
var pageName
var versionsDetails = {}
var demosVideosCurrent = 0
var franceEmojis = { i: 0, list: ['🥐', '🥖', '🍷', '🧀', '🇫🇷', '🗼'] }
const demosVideos = [
	{
		id: 'video',
		url: '/medias/demos/capture_video.mp4',
		alt: "No alt text found"
	},
	{
		id: 'pdf',
		url: '/medias/demos/capture_pdf.mp4',
		alt: "No alt text found"
	}
]

// Déterminer l'OS de l'utilisateur
function getOS(){
	const userAgent = navigator.userAgent

	if(/android/i.test(userAgent)) return 'android'
	else if(/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) return 'ios'
	else if(/win/i.test(userAgent)) return 'windows'
	else if(/mac/i.test(userAgent)) return 'macos'
	else if(/linux/i.test(userAgent)) return 'linux'

	return 'other'
}
function checkOsSupported(){
	const os = getOS()
	return os == 'macos' || os == 'windows' || os == 'linux'
}

async function waitForVideoLoaded(video){
	return new Promise((resolve) => {
		const checkReady = () => {
			if(video.readyState >= 4){ // 4 = HAVE_ENOUGH_DATA
				resolve()
				return true
			}
			return false
		}

		if(!checkReady()){
			video.addEventListener('canplaythrough', checkReady, { once: true })
			video.load() // Force le chargement sur iOS
		}
	})
}
// Ça fonctionne pas sur Safari :<
// async function waitForVideoLoaded(video){
// 	return new Promise((resolve) => {
// 		const checkBuffered = () => {
// 			if(video.buffered.length > 0){
// 				const bufferedEnd = video.buffered.end(video.buffered.length - 1)
// 				const duration = video.duration

// 				console.log(`Buffered: ${bufferedEnd.toFixed(2)} / ${duration.toFixed(2)}`)

// 				if(duration && bufferedEnd >= duration){
// 					cleanup()
// 					resolve()
// 				}
// 			}
// 		}

// 		const cleanup = () => {
// 			video.removeEventListener('progress', checkBuffered)
// 			video.removeEventListener('loadedmetadata', checkBuffered)
// 			video.removeEventListener('canplaythrough', checkBuffered)
// 		}

// 		// Si la durée est déjà connue
// 		if(video.readyState >= 1 && video.duration) checkBuffered()

// 		// Sinon on écoute les bons événements
// 		video.addEventListener('progress', checkBuffered)
// 		video.addEventListener('loadedmetadata', checkBuffered)
// 		video.addEventListener('canplaythrough', checkBuffered)

// 		// On force le chargement (iOS)
// 		video.load()
// 		video.play().then(() => video.pause()).catch(() => {}) // Essayer de play et pause immédiatement pour forcer encore + le chargement
// 	})
// }

async function hideLoader(instant = false){
	console.log("Hiding loader...")
	isLoadingPage = false
	document.getElementById('loader__spinner').style.opacity = 0
	if(!instant) await new Promise(resolve => setTimeout(resolve, 280))
	document.getElementById('loader__background').style.opacity = 0
	setTimeout(() => { document.getElementById('loader__background').remove() }, instant ? 100 : 1000)
}

// Garder en cache des images/vidéos
var preloaded = {}
async function preload(url){
	if(preloaded[url]) return

	var res = await fetch(url)
	var blob = await res.blob()
	var objectURL = URL.createObjectURL(blob)

	preloaded[url] = objectURL
}

window.onload = async function(){
	pageName = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
	if(pageName.startsWith('/')) pageName = pageName.slice(1);
	if(pageName.split('/').length > 1) pageName = pageName.split('/').slice(1).join('/');

	const os = getOS()
	const isOsSupported = checkOsSupported()
	console.log("Detected system:", os)

	try {
		autoloadVideos = !roc.isDev && !navigator.connection.saveData
	} catch (e){
		console.warn("failed to define autoloadVideos")
		console.warn(e)
	}
	console.log("Autoloading videos:", autoloadVideos)

	// Masquer le chargement s'il reste trop longtemps
	if(roc.isDev) hideLoader(true)
	setTimeout(() => {
		console.log("15sec after first page load, hiding loader if still here")
		if(isLoadingPage){
			console.log("Confirming that we're hiding loader after 15sec")
			hideLoader()
		}
	}, 15000)

	// Obtenir les traductions nécessaires
	translations = await getTranslations(language) // définit par un autre script
	demosVideos.find(video => video.id == 'video').alt = translations.demos.videoAlt || 'No alt text found'
	demosVideos.find(video => video.id == 'pdf').alt = translations.demos.pdfAlt || 'No alt text found'

	if(pageName != 'comparison'){
		// Gérer les liens de téléchargement dans le pied de page
		await fetchVersions() // va remplir l'objet versionsDetails
		if(document.getElementById('footer__macos')) document.getElementById('footer__macos').href = versionsDetails.macos
		if(document.getElementById('footer__windows')) document.getElementById('footer__windows').href = versionsDetails.windows
		if(document.getElementById('footer__linux')) document.getElementById('footer__linux').href = versionsDetails.linux

		// Gérer les boutons de téléchargement universel (s'adapte à l'OS en cours)
		const downloadButtons = document.querySelectorAll('.downloadButton__universal')
		if(downloadButtons.length){
			// Ajouter le texte (lien par défaut déjà inclus de base)
			downloadButtons.forEach((button) => {
				switch(os){
					case 'macos':
						button.style.fontFamily = 'SF Pro, sans-serif'
						button.innerText = translations.download.macos.buttonContent || 'macOS'
						button.onclick = () => {
							trackDownload(os)
							showModal('download', 'macos')
						}
						break
					case 'windows':
						button.style.fontFamily = 'Geist, sans-serif'
						button.innerText = translations.download.windows.buttonContent || 'Windows'
						button.onclick = () => trackDownload(os)
						break
					case 'linux':
						button.style.fontFamily = 'Geist, sans-serif'
						button.innerText = translations.download.linux.buttonContent || 'Linux'
						button.onclick = () => trackDownload(os)
						break
					default:
						button.href = 'javascript:shareDownload()'
						button.style.fontFamily = 'Geist, sans-serif'
						button.innerText = translations.download.default.buttonContent || 'Custom'
						break
				}
			})

			// Si on est sur une plateforme supportée
			if(isOsSupported && versionsDetails[os]) downloadButtons.forEach((button) => {
				button.href = versionsDetails[os]
			})
		}

		// Gérer les boutons de téléchargement spécifiques (page download)
		Object.keys(versionsDetails).forEach((os) => {
			if(os == 'expireDate') return

			const downloadButtons = document.querySelectorAll(`.downloadButton__${os}`)
			if(downloadButtons.length) downloadButtons.forEach((button) => {
				button.href = versionsDetails[os]
				button.onclick = () => {
					if(button.getAttribute('onclick')) eval(button.getAttribute('onclick'))
					trackDownload(os)
				}
			})
		})
	} else {
		autoloadVideos = false
		showModal('confirm')
	}

	// Gérer la section comparaison entre deux vidéos (via une fonction à laquelle on attend pas sa fin)
	if(document.getElementById('comparison')) setupComparison(autoloadVideos, pageName)

	// Gérer la vidéo de démonstration
	if(document.getElementById('demos__video')) setupDemos()

	// Effet de suivi du curseur sur l'image dans le hero
	const screenshotImg = document.querySelector('.presentationImage__width')
	if(screenshotImg){
		const container = screenshotImg.parentElement

		container.addEventListener('mousemove', (e) => {
			// Calculer la position relative
			const rect = container.getBoundingClientRect()
			const x = ((e.clientX - rect.left) / rect.width) * 2 - 1 // De -1 à 1
			const y = ((e.clientY - rect.top) / rect.height) * 2 - 1 // De -1 à 1

			// Appliquer une légère translation (max 10px dans chaque direction)
			const moveX = x * 10 // -10px à 10px
			const moveY = y * 5 // -5px à 5px

			screenshotImg.style.transform = `translate(${moveX}px, ${moveY}px)`
		})

		container.addEventListener('mouseleave', () => {
			screenshotImg.style.transform = 'translate(0, 0)'
		})
	}

	// Masquer le chargement de la page
	if(isLoadingPage) hideLoader()
}

// Détecter les appuis sur le clavier
window.onkeydown = function(e){
	if(e.key == 'Escape' && modalShown){
		Array.from(document.querySelectorAll('.modal')).forEach((el) => {
			if(el.getAttribute('data-forced') == 'true') return console.log("Can't close modal because data-forced is set to true")
			hideModal(el.id.replace('modal_', '').split('_')[0])
		})
	}
}

// Masquer les modals lorsqu'on clique en dehors
window.onclick = function(e){
	if(!modalShown) return console.log("Ignoring click because zero modals shown")
	var el = e.target
	while(el && !el.id.startsWith('modal_')){
		el = el.parentElement
	}

	if(el && el.id.startsWith('modal_') && !el.id.endsWith('__backdrop')) return console.log("Ignoring click because modal was clicked")

	const modals = document.querySelectorAll('[id^="modal_"]:not([id$="__backdrop"])')
	for(const modal of modals){
		if(!modal.classList.contains('hidden')){
			if(modal.getAttribute('data-forced') == 'true') return console.log("Can't close modal because data-forced is set to true")
			const modalId = modal.id.replace('modal_', '').split('_')[0]
			console.log(`Hiding modal with id ${modalId} because user clicked outside`)
			hideModal(modalId)
			break
		}
	}
}

// Mettre en place la section des vidéos de démonstration
async function setupDemos(){
	var demoVideo = document.getElementById('demos__video')

	// Lire la vidéo de démonstration lorsqu'elle entre dans le viewport
	const videoObserver = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			if(entry.isIntersecting){
				console.log("Playing demo video as it's in viewport")
				demoVideo.play()
			}
			else {
				console.log("Pausing demo video as it's not in viewport")
				demoVideo.pause()
			}
		})
	}, {
		root: null, // viewport comme zone d'observation
		rootMargin: '0px', // pas de marge
		threshold: 0.25 // au moins 25% visible
	})
	videoObserver.observe(demoVideo)

	// Précharger les vidéos
	await new Promise((resolve) => {
		var loaded = []

		demosVideos.forEach(async (video) => {
			await preload(video.url)
			loaded.push(video.url)

			if(loaded.length == demosVideos.length){
				console.log("Preloaded all demo videos")
				resolve()
			}
		})
	})

	// Passer à la vidéo suivante quand la vidéo en cours est terminée
	demoVideo.addEventListener('ended', async () => {
		console.log("Demo video ended, showing next one")

		demosVideosCurrent++
		if(demosVideosCurrent >= demosVideos.length) demosVideosCurrent = 0

		const nextVideoEl = document.createElement('video')
		nextVideoEl.muted = true
		nextVideoEl.playsinline = true
		nextVideoEl.preload = 'auto'
		nextVideoEl.src = preloaded[demosVideos[demosVideosCurrent].url] || demosVideos[demosVideosCurrent].url

		console.log(`Loading data for ${demosVideos[demosVideosCurrent].url}`)
		await waitForVideoLoaded(nextVideoEl)
		console.log(`Loaded data for ${demosVideos[demosVideosCurrent].url}`)

		demoVideo.src = nextVideoEl.src
		demoVideo.setAttribute('alt', demosVideos[demosVideosCurrent].alt)
		demoVideo.play()
	})

	demoVideo.classList.remove('animate-pulse')
}

// Mettre en place la section de comparaison
async function setupComparison(autoloadVideos, pageName){
	console.log("Setting up comparison section")
	const container = document.getElementById('comparison__container')
	const button = document.querySelector('.comparison__sliderButton')
	const videoBefore = document.getElementById('comparison__videoBefore')
	const videoAfter = document.getElementById('comparison__videoAfter')

	if(autoloadVideos){
		videoBefore.setAttribute('preload', 'auto')
		videoAfter.setAttribute('preload', 'auto')
	}

	let position = 50
	updatePosition(position)

	// Fonctions pour gérer le déplacement du slider
	function updatePosition(positionPercent){
		position = positionPercent
		const positionValue = `${position}%`
		document.documentElement.style.setProperty('--position', positionValue)
	}
	function handleMove(e){
		if(!isDragging) return

		let clientX
		if(e.type === 'touchmove'){
			clientX = e.touches[0].clientX
		} else {
			clientX = e.clientX
		}

		const rect = container.getBoundingClientRect()
		const x = clientX - rect.left
		const percent = Math.min(Math.max((x / rect.width) * 100, 0), 100)

		updatePosition(percent)
	}

	let isDragging = false

	// Gérer la souris
	button.addEventListener('mousedown', () => { isDragging = true })
	document.addEventListener('mouseup', () => { isDragging = false })
	document.addEventListener('mousemove', handleMove)

	// Gérer les écrans tactiles
	button.addEventListener('touchstart', () => { isDragging = true }, { passive: true })
	document.addEventListener('touchend', () => { isDragging = false })
	document.addEventListener('touchmove', handleMove)

	if(autoloadVideos){
		// Forcer le chargement des vidéos, et attendre le chargement
		console.log("Loading comparison videos")
		try {
			videoBefore.load()
			videoAfter.load()
		} catch (e){
			console.warn("failed to manually preload diff videos")
			console.warn(e)
		}
		await waitForVideoLoaded(videoBefore)
		await waitForVideoLoaded(videoAfter)
		console.log("Loaded comparison videos")
		// await new Promise((resolve) => { if(videoBefore.readyState >= 4) resolve(); else videoBefore.addEventListener('canplaythrough', resolve) })
		// await new Promise((resolve) => { if(videoAfter.readyState >= 4) resolve(); else videoAfter.addEventListener('canplaythrough', resolve) })
	}

	if(pageName != 'comparison') startComparison(autoloadVideos)
}

async function startComparison(autoloadVideos = true){
	console.log("Starting comparison videos function")

	const videoBefore = document.getElementById('comparison__videoBefore')
	const videoAfter = document.getElementById('comparison__videoAfter')

	document.getElementById('comparison').classList.add('animate-pulse')

	// Forcer le chargement des vidéos, et attendre le chargement
	console.log("Loading comparison videos")
	try {
		videoBefore.load()
		videoAfter.load()
	} catch (e){
		console.warn("failed to manually preload diff videos")
		console.warn(e)
	}
	await waitForVideoLoaded(videoBefore)
	await waitForVideoLoaded(videoAfter)
	console.log("Loaded comparison videos")

	videoBefore.currentTime = 0
	videoAfter.currentTime = 0

	document.getElementById('comparison').classList.remove('animate-pulse')

	// Gérer la synchronisation des vidéos
	var syncVideos = () => {
		if(Math.abs(videoBefore.currentTime - videoAfter.currentTime) > 0.1){
			videoBefore.pause()
			videoAfter.pause()

			console.log(`Syncing videos, videoBefore was ${videoBefore.currentTime} when videoAfter was ${videoAfter.currentTime}`)

			setTimeout(() => {
				videoAfter.currentTime = videoBefore.currentTime

				videoBefore.play()
				videoAfter.play()
			}, 100)
		}
	}
	videoBefore.addEventListener('timeupdate', syncVideos)
	videoBefore.addEventListener('ended', () => {
		videoBefore.currentTime = 0
		videoAfter.currentTime = 0
		videoBefore.play()
		videoAfter.play()
	})

	// Démarrer les vidéos
	if(autoloadVideos){
		videoBefore.play()
		videoAfter.play()
	} else {
		videoBefore.setAttribute("controls", "")
		videoAfter.setAttribute("controls", "")
	}
}

// Changer l'emoji représentant la France
function changeEmoji(el){
	franceEmojis.i++
	if(franceEmojis.i >= franceEmojis.list.length) franceEmojis.i = 0

	el.innerText = franceEmojis.list[franceEmojis.i]
}

function debug(){
	var debugText = `
	pageName: ${pageName}
	autoloadVideos: ${autoloadVideos}
	modalShown: ${modalShown}
	isLoadingPage: ${isLoadingPage}
	isFetchingVersions: ${isFetchingVersions}
	demosVideosCurrent: ${demosVideosCurrent}
	roc: ${JSON.stringify(roc) || roc}
	franceEmojis: ${JSON.stringify(franceEmojis) || franceEmojis}
	versionsDetails: ${JSON.stringify(versionsDetails) || versionsDetails}
	translations: ${JSON.stringify(translations) || translations}
	-----
	getOS(): ${getOS()}
	checkOsSupported(): ${checkOsSupported()}
	preloaded: ${JSON.stringify(preloaded) || preloaded}
	-----
	navigator.canShare: ${navigator.canShare}
	navigator.connection: ${JSON.stringify(navigator.connection) || navigator.connection}
	`

	console.log('debugText:', debugText)

	try {
		navigator.clipboard.writeText(debugText)
	} catch (e){
		console.warn("failed to copy debugText to clipboard")
		console.warn(e)
		alert(debugText)
	}
}

function trackDownload(platform){
	var id = `${Date.now()}z${Math.random().toString(36).substring(2, 15)}${(Math.random() * 10 * Math.random()).toString().replace('.', '')}`.substring(0, 32)
	fetch(`https://fwl-analytics.bassinecorp.fr/download?a=${id}&b=${platform}&c=6c69ecf8-a8fb-4ded-b135-239de1ece7ce&d=6d57cdd1-70e6-4eca-8835-d95c44bd92d1=z`, {
		method: 'POST',
		header: { 'Authorization': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmaWxlIjoid2VpZ2h0IiwibG9zcyI6MX0.rA4P-gqOO9yaTMcWjl4ttLcaZ1wuDCcueadJcAYYimc' }
	})
}

// Gérer les modals
async function showModal(idPrefix, context){
	if(modalShown) return console.log("Modal already shown")
	modalShown = true

	if(context == 'macos'){
		await new Promise(resolve => setTimeout(resolve, 800))
		setTimeout(() => showModal(idPrefix, context), 500) // Certains navs peuvent fermer le modal au début du téléchargement
		setTimeout(() => showModal(idPrefix, context), 1000) // Certains navs peuvent fermer le modal au début du téléchargement

		document.getElementById(`modal_${idPrefix}__title`).innerText = translations.download.macos.downloadInstructionsTitle || 'Instructions'
		document.getElementById(`modal_${idPrefix}__content`).innerHTML = translations.download.macos.downloadInstructionsContent || 'jsp on trouve pas le texte, carrément jparle français sayer'
	}

	var modal__backdrop = document.getElementById(`modal_${idPrefix}__backdrop`)
	var modal__container = document.getElementById(`modal_${idPrefix}__container`)

	modal__backdrop.classList.remove('hidden')
	modal__container.classList.add('grid')
	modal__container.classList.remove('hidden')

	await new Promise(resolve => setTimeout(resolve, 1))

	modal__backdrop.classList.add('opacity-70')
	modal__backdrop.classList.remove('opacity-0')
	modal__container.classList.remove('opacity-0')
}
async function hideModal(idPrefix){
	var modal__backdrop = document.getElementById(`modal_${idPrefix}__backdrop`)
	var modal__container = document.getElementById(`modal_${idPrefix}__container`)

	modalShown = false

	modal__container.classList.add('opacity-0')
	modal__backdrop.classList.add('opacity-0')
	await new Promise(resolve => setTimeout(resolve, 90))
	modal__backdrop.classList.remove('opacity-70')

	await new Promise(resolve => setTimeout(resolve, 700))

	modal__backdrop.classList.add('hidden')
	modal__container.classList.add('hidden')
	modal__container.classList.remove('grid')
}

async function fetchVersions(){
	if(sessionStorage.getItem('versions')){
		console.log("Found versions details in cache")
		try {
			var _versionsDetails = JSON.parse(sessionStorage.getItem('versions'))
			if(_versionsDetails.expireDate > new Date().getTime()) versionsDetails = _versionsDetails
			else {
				console.log("Cached versions details were expired, fetching again")
				sessionStorage.removeItem('versions')
			}
		} catch (e){
			console.error("Can't parse versions from session storage, JSON may be malformed")
			console.error(e)
		}
	}
	if(versionsDetails.windows && versionsDetails.macos){
		console.log("versionsDetails (1)", versionsDetails)
		return true
	}

	versionsDetails = { windows: 'https://github.com/el2zay/fileweightloss/releases/latest', macos: 'https://github.com/el2zay/fileweightloss/releases/latest', linux: 'https://github.com/el2zay/fileweightloss/releases/latest' }

	var versions = await fetch('https://api.github.com/repos/el2zay/fileweightloss/releases')
	if(!versions.ok){
		console.error("Can't get releases from GitHub API, check Network Requests")
		return false
	}

	try {
		versions = await versions.json()
	} catch (e){
		console.error("Can't parse releases from GitHub API, JSON may be malformed")
		console.error(e)
	}

	versions = versions.filter(v => v.prerelease == false && v.draft == false)
	versions = versions.sort((a, b) => {
		const aDate = new Date(a.published_at)
		const bDate = new Date(b.published_at)
		return bDate - aDate
	})

	if(!versions.length){
		console.error("No releases found, list is empty")
		return false
	}

	versions[0].assets.forEach(asset => {
		if(asset.name.includes('.dmg')) versionsDetails.macos = asset.browser_download_url
		else if(asset.name.includes('.exe')) versionsDetails.windows = asset.browser_download_url
		// else if(asset.name.includes('')) versionsDetails.linux = asset.browser_download_url // pas encore dispo
	})

	versionsDetails.expireDate = new Date().getTime() + 1000 * 60 * 60 * 6 // 6h
	sessionStorage.setItem('versions', JSON.stringify(versionsDetails))

	console.log('versionsDetails (2)', versionsDetails)
	return true
}

async function autoDownload(){
	if(!checkOsSupported()){
		location.href = '/download'
		return
	}

	if(isFetchingVersions) return
	if(!versionsDetails.windows || !versionsDetails.macos){
		isFetchingVersions = true
		await fetchVersions()
		isFetchingVersions = false
	}

	const os = getOS()
	if(os == 'macos') location.href = versionsDetails.macos
	else if(os == 'windows') location.href = versionsDetails.windows
	else if(os == 'linux') location.href = versionsDetails.linux
	else alert(`Platform '${os}' unsupported! Report this to johan@johanstick.fr or through https://johanstick.fr/#contact`)

	trackDownload(os)

	if(os == 'macos') showModal('download', 'macos')
}

function shareDownload(){
	if(navigator.canShare && navigator.share){
		navigator.share({
			url: 'https://fwl.bassinecorp.fr/download',
			title: translations.download.shareDownloadTitle || undefined
		})
	} else location.href = 'download'
}

async function getTranslations(language){
	var translations

	if(sessionStorage.getItem(`translations-${language}`) && sessionStorage.getItem(`translations-expire-${language}`)){
		var expireDate = sessionStorage.getItem(`translations-expire-${language}`)
		if(expireDate > Date.now()){
			console.log(`Found cached translations for language ${language}`)
			try {
				translations = JSON.parse(sessionStorage.getItem(`translations-${language}`))
				return translations
			} catch (e){
				console.error("Can't parse translations from session storage, JSON may be malformed")
				console.error(e)
				translations = null
				sessionStorage.removeItem(`translations-${language}`)
			}
		} else {
			console.log(`Cached translations for language ${language} were expired, fetching again`)
			sessionStorage.removeItem(`translations-${language}`)
			sessionStorage.removeItem(`translations-expire-${language}`)
		}
	}
	if(translations) return translations

	console.log(`Fetching translations for language ${language}`)
	var res = await fetch(`/translations/${language}.json`).catch(e => {
		console.error(`Can't fetch translations for language ${language}`)
		console.error(e)
		return null
	})

	if(!res.ok){
		console.error(`Can't fetch translations for language ${language}`)
		return null
	}

	try {
		translations = await res.json()
	} catch (e){
		console.error(`Can't parse translations for language ${language}`)
		console.error(e)
		return null
	}

	sessionStorage.setItem(`translations-${language}`, JSON.stringify(translations))
	sessionStorage.setItem(`translations-expire-${language}`, new Date().getTime() + 1000 * 60 * 60 * 24) // 1 jour
	return translations
}