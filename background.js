'use strict';

const reData = new RegExp('^data:(.*?);base64,(.*)$');

const idleIcon = {
	path: {
		16: 'icons/idle-16.png',
		48: 'icons/idle-48.png',
		64: 'icons/idle-64.png',
		128: 'icons/idle-128.png',
		256: 'icons/idle-256.png',
	},
}

const activeIcon = {
	path: {
		16: 'icons/active-16.png',
		48: 'icons/active-48.png',
		64: 'icons/active-64.png',
		128: 'icons/active-128.png',
		256: 'icons/active-256.png',
	},
}

async function handleClick(tab, e) {
	if (e.modifiers.includes('Shift')) {
		await sendPaste();
		return;
	}

	const imgURL = await browser.tabs.captureTab(tab.id);

	let noteParts = [
		`<body>`,
		`<a href="${encodeURI(tab.url)}">${escapeHTML(tab.url)}</a>`,
	];

	const selected = await getSelectedText(tab.id);
	if (selected) {
		noteParts.push(`\n\n${escapeHTML(selected)}`);
	}

	noteParts.push('</body>');

	await queue('create', {
		name: tab.title,
		html_notes: noteParts.join(''),
		attach: imgURL,
		filename: 'screenshot.png',
	});

	if (!e.modifiers.includes('Command')) {
		browser.tabs.remove([tab.id]);
	}
}

async function sendPaste() {
	const clip = await navigator.clipboard.readText();

	await queue('create', {
		name: 'Paste',
		html_notes: `<body>${escapeHTML(clip)}</body>`,
	});
}

let inHandleChange = false;

async function handleChange(e) {
	// async functions allow concurrency. Add sketchy mutex.
	if (inHandleChange) {
		return;
	}

	try {
		inHandleChange = true;
		await handleChangeInt(e);
	} finally {
		inHandleChange = false;
	}
}

async function handleChangeInt(e) {
	const queue = await browser.storage.local.get();
	const keys = Object.getOwnPropertyNames(queue);

	if (keys.length == 0) {
		browser.browserAction.setIcon(idleIcon);
		return;
	}

	// If some tasks cause issues, make progress on the others over time
	const rand = Math.floor(Math.random() * keys.length);
	const key = keys[rand];
	const task = queue[key];

	const cfg = await browser.storage.sync.get();

	const type = key.split('_', 1)[0];
	await typeHandlers.get(type)(cfg, task);

	await browser.storage.local.remove([key]);
}

async function create(cfg, task) {
	const req = {
		data: {
			workspace: cfg.workspace,
			assignee: cfg.assignee,
			name: task.name,
			html_notes: task.html_notes,
		},
	};

	const createResp = await fetch(
		'https://app.asana.com/api/1.0/tasks',
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${cfg.token}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			credentials: 'omit',
			body: JSON.stringify(req),
		},
	);

	if (!createResp.ok) {
		throw createResp.statusText;
	}

	const create = await createResp.json();

	if (task.attach) {
		await queue('attach', {
			gid: create.data.gid,
			attach: task.attach,
			filename: task.filename,
		});
	}
}

async function attach(cfg, task) {
	const data = new FormData();
	const blob = dataURLToBlob(task.attach);
	data.append('file', blob, task.filename);

	const attachResp = await fetch(
		`https://app.asana.com/api/1.0/tasks/${encodeURIComponent(task.gid)}/attachments`,
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${cfg.token}`,
			},
			credentials: 'omit',
			body: data,
		},
	);

	if (!attachResp.ok) {
		throw attachResp.statusText;
	}
}

async function queue(type, details) {
	browser.browserAction.setIcon(activeIcon);

	const store = {};
	store[`${type}_${crypto.randomUUID()}`] = details;
	await browser.storage.local.set(store);
}

async function getSelectedText(tabId) {
	const selecteds = await browser.tabs.executeScript(
		tabId,
		{
			code: 'getSelection().toString()',
		},
	);

	return selecteds.filter(x => x).join('\n');
}

function dataURLToBlob(url) {
	const [_, type, base64] = url.match(reData);
	const bytes = atob(base64);

	const arr = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		arr[i] = bytes.charCodeAt(i);
	}

	return new Blob(
		[arr],
		{
			type: type,
		},
	);
}

function escapeHTML(unsafe) {
	const div = document.createElement('div');
	div.innerText = unsafe;
	return div.innerHTML.replaceAll('<br>', '\n');
}

const typeHandlers = new Map([
	['create', create],
	['attach', attach],
]);

browser.browserAction.onClicked.addListener(handleClick);
browser.storage.local.onChanged.addListener(handleChange);
setInterval(handleChange, 10000);
