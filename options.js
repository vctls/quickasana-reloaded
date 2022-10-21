async function onLoad() {
	const cfg = await browser.storage.sync.get();

	const token = document.getElementById('token');
	token.value = cfg.token || '';
	token.addEventListener('input', async () => {
		set('token', token.value);
		await populateWorkspaces();
		await populateAssignees();
	});

	await populateWorkspaces();
	await populateAssignees();

	const workspace = document.getElementById('workspace');
	workspace.addEventListener('change', async () => {
		await set('workspace', workspace.value);
	});

	const assignee = document.getElementById('assignee');
	assignee.addEventListener('change', async () => {
		await set('assignee', assignee.value);
	});
}

async function populateWorkspaces() {
	const cfg = await browser.storage.sync.get();

	if (!cfg.token) {
		return;
	}

	const workspacesResp = await fetch(
		'https://app.asana.com/api/1.0/workspaces',
		{
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${cfg.token}`,
				'Accept': 'application/json',
			},
			credentials: 'omit',
		},
	);

	const workspaces = await workspacesResp.json();

	const select = document.getElementById('workspace');
	select.innerHTML = '';

	for (const workspace of workspaces.data) {
		const option = document.createElement('option');
		option.innerText = workspace.name;
		option.value = workspace.gid;
		select.appendChild(option);

		if (option.value == cfg.workspace) {
			option.selected = true;
		}
	}

	if (!cfg.workspace) {
		await set('workspace', select.value);
	}
}

async function populateAssignees() {
	const cfg = await browser.storage.sync.get();

	if (!cfg.token) {
		return;
	}

	// TODO: Support other assignees

	const meResp = await fetch(
		'https://app.asana.com/api/1.0/users/me',
		{
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${cfg.token}`,
				'Accept': 'application/json',
			},
			credentials: 'omit',
		},
	);

	const me = await meResp.json();

	const select = document.getElementById('assignee');
	select.innerHTML = '';

	const option = document.createElement('option');
	option.innerText = `${me.data.name} <${me.data.email}>`;
	option.value = me.data.gid;
	select.appendChild(option);

	option.selected = true;

	if (!cfg.assignee) {
		await set('assignee', select.value);
	}
}

async function set(key, val) {
	const store = {};
	store[key] = val;
	await browser.storage.sync.set(store);
}

addEventListener('DOMContentLoaded', onLoad);
