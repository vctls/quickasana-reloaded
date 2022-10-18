const reData = new RegExp('^data:(.*?);base64,(.*)$');

async function handleClick() {
	const tabs = await browser.tabs.query({currentWindow: true, active: true});
	if (tabs.length != 1) {
		return;
	}
	const tab = tabs[0];

	const promiseImgURL = browser.tabs.captureTab(tab.id);

	const cfg = await browser.storage.sync.get();
	const req = {
		data: {
			workspace: cfg['workspace'],
			assignee: cfg['assignee'],
			name: tab.title,
			notes: tab.url,
		},
	};
	console.log('-->', req);

	const promiseCreateResp = fetch(
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

	const imgURL = await promiseImgURL;
	const [_, imgType, imgBase64] = imgURL.match(reData);
	const img = atob(imgBase64);

	// All tab info captured
	browser.tabs.remove([tab.id]);

	const createResp = await promiseCreateResp;
	const create = await createResp.json();

	console.log('<--', create);

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
