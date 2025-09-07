'use strict';

const apiUrl = `https://app.asana.com/api/1.0`;

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
	const cfg = await browser.storage.sync.get();
	if (!cfg.token || !cfg.workspace || !cfg.assignee) {
		await browser.runtime.openOptionsPage();
		return;
	}

	if (e.modifiers.includes('Shift')) {
		await sendPaste();
		return;
	}

	if (!tab.url) {
		throw 'missing tab.url';
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
		await browser.tabs.remove([tab.id]);
	}
}

/**
 * @param {browser.menus.OnClickData} onClickData
 * @returns {Promise<void>}
 */
async function handleContextMenuAction(onClickData) {
	const cfg = await browser.storage.sync.get();
	if (!cfg.token || !cfg.workspace || !cfg.assignee) {
		await browser.runtime.openOptionsPage();
		return;
	}

	let selected = onClickData.selectionText;

	if (!selected) {
		// This should never happen since the menu entry is only supposed to apply to a selection context.
	    throw 'no text selected';
	}

	const dueDateTag = RegExp.escape(cfg.dueDateTag);
	const dueDateMatches = selected.match(new RegExp(`\\b${dueDateTag}(\\S+)`));
	let dueDate = dueDateMatches?.[1] || undefined;

	if (dueDate) {
		selected = selected.replace(dueDateMatches?.[0],'');
		
		try {
		    dueDate = new Date(dueDate).toISOString().substring(0, 10);
		} catch($e) {
			await notify(
				'Unrecognized date',
				`The due date ${dueDate} is not a valid date.`,
			)
			throw 'Invalid due date';
		}
	}

	const assigneeTag = RegExp.escape(cfg.assigneeTag);
	const assigneeMatches = selected.match(new RegExp(`\\b${assigneeTag}(\\S+)`));
	const assigneeEmail = assigneeMatches?.[1] || undefined;
	let assigneeGid = undefined

	if (assigneeEmail) {
		assigneeGid = await getUser(cfg, assigneeEmail)
		if (assigneeGid) {
			selected = selected.replace(assigneeMatches?.[0], '')
		}
	}

	let noteParts = [
		`<body>`,
		`<a href="${encodeURI(onClickData.pageUrl)}">${escapeHTML(onClickData.pageUrl)}</a>`,
		`\n\n${escapeHTML(selected)}`,
		'</body>',
	];

	await queue('create', {
		// TODO Truncate the task name. What's the maximum length?
		// TODO Use a tag for the name instead, and default to the truncated body when absent.
		//  A different syntax will be needed for the subject tag, as it will contain spaces.
		name: selected.trim(),
		dueDate: dueDate,
		assignee: assigneeGid,
		html_notes: noteParts.join(''),
	});
}

async function sendPaste() {
	const clip = await navigator.clipboard.readText();

	await queue('create', {
		name: 'Paste',
		html_notes: `<body>${escapeHTML(clip)}</body>`,
	});
}

let inHandleChange = false;

async function handleChange() {
	// async functions allow concurrency. Add sketchy mutex.
	if (inHandleChange) {
		return;
	}

	try {
		inHandleChange = true;
		await handleChangeInt();
	} finally {
		inHandleChange = false;
	}
}

async function handleChangeInt() {
	const queue = await browser.storage.local.get();
	const keys = Object.getOwnPropertyNames(queue);

	if (keys.length === 0) {
		await browser.browserAction.setIcon(idleIcon);
		return;
	}

	// If some tasks cause issues, make progress on the others over time
	const rand = Math.floor(Math.random() * keys.length);
	const key = keys[rand];
	const task = queue[key];

	const cfg = await browser.storage.sync.get();

	if (!cfg.token) {
		throw 'missing token';
	}

	const type = key.split('_', 1)[0];
	await typeHandlers.get(type)(cfg, task);

	await browser.storage.local.remove([key]);
}

async function create(cfg, task) {
	if (!cfg.workspace || !cfg.assignee) {
		throw 'missing workspace/assignee';
	}

	const req = {
		data: {
			workspace: cfg.workspace,
			projects: [ cfg.project ],
			assignee: task.assignee || cfg.assignee,
			due_on: task.dueDate,
			name: task.name,
			html_notes: task.html_notes,
		},
	};

	const createResp = await fetch(
		`${apiUrl}/tasks`,
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

	try {
		await navigator.clipboard.writeText(create.data.permalink_url);
	} catch (DOMException){
		// This may fail in some circumstances,
		// for example, if the tab isn't focused.
	}

	await notify(
		'New task created',
		create.data.permalink_url,
	);

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
		`${apiUrl}/tasks/${encodeURIComponent(task.gid)}/attachments`,
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

/**
 * @param cfg
 * @param {string} email
 * @returns {Promise<?string>}
 */
async function getUser(cfg, email) {
	const getUserResp = await fetch(
		`${apiUrl}/users/${email}`,
		{
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${cfg.token}`,
				'Accept': 'application/json',
			},
			credentials: 'omit',
		},
	);

	if (!getUserResp.ok) {
		await notify(
			'Assignee not found',
			`No user found with email ${email}`,
		)
		throw 'Assignee not found';
	}

	const result = await getUserResp.json();

	return result.data.gid;
}

/**
 * @param {string} title
 * @param {string} message
 * @returns {Promise<void>}
 */
async function notify(title, message) {
	await browser.notifications.create({
		type: 'basic',
		iconUrl: browser.runtime.getURL('icons/idle-48.png'),
		title: title,
		message: message,
	})
}

async function queue(type, details) {
	await browser.browserAction.setIcon(activeIcon);

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

browser.menus.create(
	{
		id: "quick_asana",
		title: "Create task from selection",
		contexts: ["selection"],
		onclick: handleContextMenuAction,
	},
);
browser.browserAction.onClicked.addListener(handleClick);
browser.storage.local.onChanged.addListener(handleChange);
setInterval(handleChange, 10000);
