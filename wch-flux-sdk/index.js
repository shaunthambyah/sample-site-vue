/*
Copyright IBM Corporation 2017.
LICENSE: Apache License, Version 2.0
*/
let
	// host = window.location.hostname.replace('-preview',''),
	host = window.location.hostname,
	tenant = window.location.pathname.split('/')[1],
	protocol = window.location.protocol,
	inPreview = (host.includes('-preview') && host.includes('.ibm.com')) ? true : false;

window.WchSdk = {};

let sitePromise = null;
let siteDraftPromise = null;
let navChangeFunc = () => {};
let contentPromises = {};
let subscriptions = {
	content: [],
	queries: [],
	routes: [],
	site: []
};

console.log(`We are ${(inPreview)?'':'NOT '}in Preview`);

if (inPreview) {
	window.addEventListener("message", receiveMessage, false);
}

function receiveMessage (event) {
	if (event.data.type !== 'WchSdk.router.activeRoute.subscribe') {
		console.info('wch-flux-sdk', event.data);
	}
	switch (event.data.type) {
		case "WchSdk.refresh": {
			let flag = true;
			Object.keys(WchStore.content).forEach(key => {
				if(WchStore.content[key].hasOwnProperty('draftId') && WchStore.content[key].draftId === event.data.id){
				flag = false;
				loadContentDraft(key, true);
				}
			});

			if(flag){
				// if(loadContentDraft(event.data.id, true) === 'page');{
				//  flag = false;
				// }
				loadSite('default', true);
			}
			break;
		}
		case "WchSdk.router.navigateByPath":
			navChangeFunc(event.data.path);
			break;
		case 'WchSdk.router.activeRoute.subscribe':
			window.parent.postMessage({type: 'WchSdk.router.activeRoute.subscribeResponse'}, event.origin);
			break;
		default:
			console.info('wch-flux-sdk: Unhandled event', event.data.type);
			break;
	}
}

export function configWCH (hostname=window.location.hostname, tenantId=window.location.pathname.split('/')[1]) {
	host = hostname;
	tenant = tenantId;
	inPreview = (host.match(/-preview\.ibm\.com/)) ? true : false;
}

export function getHost () {    
    return host;
}

export function getTenant () {    
    return tenant;
}

export function setNavChangeFunction (func) {
	navChangeFunc = func;
}

export let WchStore = {
	content: {},
	queries: {},
	routes: {},
	site: {}
};

export function subscribe (to, callback) {
	if (!subscriptions.hasOwnProperty(to)) {
		subscriptions[to] = [];
	}

	let index = subscriptions[to].push(callback) - 1;

	return {
		unsubscribe () { delete subscriptions[to][index]; }
	};
}

export function updateContent(content) {
	WchStore.content = Object.assign({}, WchStore.content, {[content.id]: content});
	subscriptions.content.forEach(sub => sub('update-content', content));
}

export function createDraftImageUrl(image, rendition) {
	if (image) {
		let source = image.renditions.default.source;

		if (image.renditions[rendition]) {
			source = image.renditions[rendition].source;
		}
		return `${protocol}//${host}/api${source}`;
	}
	return '';
}

export function loadContent (id, force=false, onError) {
	if (!force && contentPromises[id] && WchStore.content[id] || !id) {
		return;
	}

	// let contentApi = (inPreview) ? 'delivery/v1/rendering/context' : 'delivery/v1/content';
	if (!contentPromises[id] || force) {
		contentPromises[id] = fetch(`${protocol}//${host}/api/${tenant}/delivery/v1/rendering/context/${id}`, {
		}).then(res => {
			if (!res.ok && onError) {
				onError(res.status, res.statusText);
			}
			return res.json();
		});
	}

	contentPromises[id].then(content => {
		for (let element in content.elements) {
			if (content.elements[element].elementType === 'reference' && content.elements[element].value) {
				if (!content.elements[element].value.classification) {
					break;
				}

				const c = Object.assign({}, content.elements[element].value);
				contentPromises[c.id] = Promise.resolve(c);
				loadContent(c.id);
			}
		}

		WchStore.content = Object.assign({}, WchStore.content, {[id]: content});
		subscriptions.content.forEach(sub => sub('load-content', content));
	});
}

export function loadContentDraft (id, force=false, onError) {
	if (!force && contentPromises[id] && WchStore.content[id] || !id) {
		return;
	}

	// let contentApi = (inPreview) ? 'delivery/v1/rendering/context' : 'delivery/v1/content';

	if (!contentPromises[id] || force) {
		contentPromises[id] = fetch(`${protocol}//${host}/api/${tenant}/delivery/v1/rendering/context/${id}`, {
			}).then(res => {
				if (!res.ok && onError) {
			onError(res.status, res.statusText);
		}
		return res.json();
	});
	}

	contentPromises[id].then(content => {
				for (let element in content.elements) {
			if (content.elements[element].elementType === 'reference' && content.elements[element].value) {
				if (!content.elements[element].value.classification) {
					break;
				}

				const c = Object.assign({}, content.elements[element].value);
				contentPromises[c.id] = Promise.resolve(c);
				loadContent(c.id);
			}
		}
		if(content.hasOwnProperty('kind') && content.kind[0] === 'page') {
		loadSite('default', true);
		return 'page';
	}

	// content.id = content.linkedDocId;
	// let temp = {};
	// $.extend(true, temp, WchStore.content[content.id], content);
	// WchStore.content[content.id] = temp;
	WchStore.content = Object.assign({}, WchStore.content, {[id]: content});
	subscriptions.content.forEach(sub => sub('load-content', content));
});
}

export function getContent (id) {
	return WchStore.content[id];
}

function mapNav (pages) {
	for (let i=0; i < pages.length; i++) {
		WchStore.routes = Object.assign({}, WchStore.routes, {[pages[i].route]: {
			contentId: pages[i].contentId,
			layoutId: pages[i].layoutId
		}});

		if (pages[i].children) {
			mapNav(pages[i].children);
		}
	}
}

export function loadSite (siteName='default', force=false) {
	if (!force && sitePromise && Object.keys(WchStore.site).length !== 0) {
		return;
	}

	if (!sitePromise || force) {
		sitePromise = fetch(`${protocol}//${host}/api/${tenant}/delivery/v1/rendering/sites/${siteName}`,
				{}).then(res => res.json());
	}

	sitePromise.then(site => {
		mapNav(site.pages);

	WchStore.site = Object.assign({}, WchStore.site, site);
	subscriptions.site.forEach(sub => sub('load-site'));
	subscriptions.routes.forEach(sub => sub('load-site'));
});
}

export function getSite () {
	return WchStore.site;
}

export function getRoute (route) {
	return WchStore.routes[route];
}

export function getRouteForContentId (id) {
	return Object.keys(WchStore.routes).find(key => WchStore.routes[key].contentId === id);
}

export function getQueryString (type, rows) {
	return `q=type:%22${type}%22&fq=classification:(content)&fq=isManaged:(%22true%22)&sort=lastModified desc&fl=document:%5Bjson%5D,lastModified&rows=${rows}`;
}

export function queryContent (type, rows) {
	let searchQuery = getQueryString(type, rows);
	fetch(`${protocol}//${host}/api/${tenant}/delivery/v1/search?${searchQuery}`, {}).then(res => {
		res.json().then(results => {
			if (results.numFound > 0) {
				results.documents.map(item => item.document).forEach(item => {
					contentPromises[item.id] = Promise.resolve(item);

					loadContent(item.id);
				});
			}

			WchStore.queries = Object.assign({}, WchStore.queries, {[searchQuery]: {
					numFound: results.numFound,
					itemIds: results.documents.map(item => item.document.id),
					itemsContext: results.documents.map(item => item.document)
			}});
			subscriptions.queries.forEach(sub => sub('query-content'));
		});
	});
}

export function getQuery (queryString) {
	return WchStore.queries[queryString];
}

export function getImageUrl (image, rendition='default') {
	if (image && image.renditions) {
		if (image.renditions[rendition]) {
			let url = image.renditions[rendition].url;
      return `${protocol}//${host}${url}`;
		}
    else if (image.renditions.default.url) {
      let url = image.renditions.default.url;
      return `${protocol}//${host}${url}`;
    }
	}
	return '';
}

export function getVideoUrl (video) {
	if (video) {
		return `${protocol}//${host}${video.url}`;
	}
	return '';
}

export function getFileUrl (file) {
	if (file) {
		return `${protocol}//${host}${file.url}`;
	}
	return '';
}

export function getFirstCategory (element, defaultValue='medium') {
	if(element.categories) {
		return element.categories[0].split('/').pop().toLowerCase();
	}

	return defaultValue;
}

export function sortQueriedItems (items, field, sortOrder, maxItemsToDisplay) {
	let itemType = (items && items[0] && items[0].elements[field]) ? items[0].elements[field].elementType : "";
	//only sort if there is a valid field to sort on
	if (itemType) {
		items.sort((a, b) => {
			let itemA = a.elements[field].value;
			let itemB = b.elements[field].value;
			switch (itemType) {
				case 'datetime': {
					return sortGeneric(new Date(itemA), new Date(itemB));
				}
				default: {
					return sortGeneric(itemA, itemB);
				}
			}
	});

		/*
		 reverse Date so the latest dates are first in the list
		 */
		if (sortOrder === 'by date descending' || sortOrder === 'Alphabetical descending') {
			items.reverse();
		}

		if(maxItemsToDisplay){
			items = items.slice(0, maxItemsToDisplay);
		}
	}

	return (items);
}

function sortGeneric (a, b) {
	if (a < b) {
		return -1;
	} else if(a > b) {
		return 1;
	}
	return 0;
}
