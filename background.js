function handleClick() {
	browser.tabs.query({currentWindow: true, active: true}).then(handleTabs);
}

function handleTabs(tabs) {
	if (tabs.length != 1) {
		return;
	}

	handleTab(tabs[0]);
}

function handleTab(tab) {
	console.log(tab.title, tab.url);
	const req = {
		data: {
			workspace: browser.storage.sync.get('workspace'),
			assignee: browser.storage.sync.get('assignee'),
			name: tab.title,
			notes: tab.url,
		},
	};

	console.log('-->', req);

	console.log(browser.tabs);
	browser.tabs.captureTab(tab.id).then(img => console.log(img));

	fetch(
		'https://app.asana.com/api/1.0/tasks',
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${browser.storage.sync.get('token')}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			body: JSON.stringify(req),
		},
	).then(resp => {
		console.log('<--', resp);
		resp.json().then(js => console.log('<--', js));
	
		browser.tabs.remove([tab.id]);
	});
}

browser.browserAction.onClicked.addListener(handleClick);
