# Quick Asana

_Quick Asana is an unofficial extension that uses the Asana API and is not developed or endorsed by Asana, Inc., the makers of Asana._

Quick Asana is a browser extension to add tasks to [Asana](https://asana.com/) with a single click -- no other UI interaction necessary.

## Creating Tasks
There are two ways of creating tasks with this extension:
1. By clicking the extension icon
   * Click: Create a task in Asana from the current tab and close the tab
   * ⌘-Click: Create a task in Asana from the current tab
   * ⇧-Click: Create a task in Asana from the clipboard contents

2. Using the context menu entry
   * Select some text => Right click => "Create task from selection"

When creating a task from the current tab, Quick Asana will use the page title as the task name, put a link to the page in the notes, and attach a screenshot of the visible tab contents to the task. If there is highlighted text when you click the extension icon, the text will be added to the task notes.

When creating a task from selected text, Quick Asana will try to find a due date in the form "YYYY-MM-DD", and an
assignee identified by their email address. If these are found, the corresponding task fields will be filled, and the
values will be removed from the text before it's added to the task name.

Once the task is created, its permalink will be copied to the clipboard (provided that the tab is still focused).

## Setup
Quick Asana uses [personal access tokens](https://developers.asana.com/docs/personal-access-token) for authentication. Before using the extension the first time, you'll need to provide a token in the extension preferences. You'll then need to choose a workspace and assignee for new tasks.
