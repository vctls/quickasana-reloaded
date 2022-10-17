async function handleClick() {
	const tabs = await browser.tabs.query({currentWindow: true, active: true});
	if (tabs.length != 1) {
		return;
	}
	const tab = tabs[0];

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

	const promiseImg = browser.tabs.captureTab(tab.id);

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

	const img = await promiseImg;
	const createResp = await promiseCreateResp;
	const create = await createResp.json();

	console.log('<--', create);

	browser.tabs.remove([tab.id]);
}

browser.browserAction.onClicked.addListener(handleClick);
