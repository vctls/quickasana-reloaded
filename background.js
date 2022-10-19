'use strict';

const reData = new RegExp('^data:(.*?);base64,(.*)$');

async function handleClick(tab, e) {
	if (e.modifiers.includes('Shift')) {
		await sendPaste();
		return;
	}

	const imgURL = await browser.tabs.captureTab(tab.id);

	const selecteds = await browser.tabs.executeScript(
		tab.id,
		{
			code: 'getSelection().toString()',
		},
	);
	const selected = selecteds.filter(x => x).join('\n');

	let noteParts = [
		`<body>`,
		`<a href="${encodeURI(tab.url)}">${escapeHTML(tab.url)}</a>`,
	];

	if (selected) {
		noteParts.push(`\n\n${escapeHTML(selected)}`);
	}

	noteParts.push('</body>');

	const store = {};
	store[`create_${crypto.randomUUID()}`] = {
		name: tab.title,
		html_notes: noteParts.join(''),
		attach: imgURL,
		filename: 'screenshot.png',
	};
	await browser.storage.local.set(store);

	if (!e.modifiers.includes('Command')) {
		browser.tabs.remove([tab.id]);
	}
}

async function sendPaste() {
	const clip = await navigator.clipboard.readText();

	const store = {};
	store[`create_${crypto.randomUUID()}`] = {
		name: 'Paste',
		html_notes: `<body>${escapeHTML(clip)}</body>`,
	};
	await browser.storage.local.set(store);
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
		const store = {};
		store[`attach_${crypto.randomUUID()}`] = {
			gid: create.data.gid,
			attach: task.attach,
			filename: task.filename,
		};
		await browser.storage.local.set(store);
	}
}

async function attach(cfg, task) {
	const [_, type, base64] = task.attach.match(reData);
	const bytes = atob(base64);

	const arr = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		arr[i] = bytes.charCodeAt(i);
	}
	const blob = new Blob(
		[arr],
		{
			type: type,
		},
	);

	const data = new FormData();
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
