const reData = new RegExp('^data:(.*?);base64,(.*)$');

async function handleClick(tab, e) {
	const imgURL = await browser.tabs.captureTab(tab.id);
	const [_, imgType, imgBase64] = imgURL.match(reData);
	const img = atob(imgBase64);

	const store = {};
	store[`create_${crypto.randomUUID()}`] = {
		title: tab.title,
		url: tab.url,
		imgURL: imgURL,
	};
	await browser.storage.local.set(store);

	if (!e.modifiers.includes('Command')) {
		browser.tabs.remove([tab.id]);
	}

	const cfg = await browser.storage.sync.get();
	const req = {
		data: {
			workspace: cfg['workspace'],
			assignee: cfg['assignee'],
			name: tab.title,
			notes: tab.url,
		},
	};

	const createResp = await fetch(
		'https://app.asana.com/api/1.0/tasks',
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${cfg['token']}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			body: JSON.stringify(req),
		},
	);
	const create = await createResp.json();

	const imgBytes = new Uint8Array(img.length);
	for (let i = 0; i < img.length; i++) {
		imgBytes[i] = img.charCodeAt(i);
	}
	const blob = new Blob(
		[imgBytes],
		{
			type: imgType,
		},
	);

	const data = new FormData();
	data.append('file', blob, 'screenshot.png');

	const attachResp = await fetch(
		`https://app.asana.com/api/1.0/tasks/${encodeURIComponent(create['data']['gid'])}/attachments`,
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${cfg['token']}`,
			},
			body: data,
		},
	);
}

browser.browserAction.onClicked.addListener(handleClick);
