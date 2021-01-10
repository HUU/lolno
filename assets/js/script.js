import BezierEasing from 'bezier-easing';
import Reframe from 'reframe.js';
import Prism from 'prismjs';
import $ from 'jquery';

/*
 * ----------------------------------------------------------------
 * Event Handlers
 * ----------------------------------------------------------------
 */

const scroll = {
	y: null,
	handlers: [],
	init: function () {
		window.addEventListener('scroll', (e) => {
			window.requestAnimationFrame(scroll.run)
		}, false);
	},
	run: function (timestamp, resized) {
		const scrollTop = window.pageYOffset;
		if (resized || scrollTop !== scroll.y) {
			scroll.y = scrollTop;

			if (scroll.resetTo > -1) { // hack to fix scroll jump during popstate (back and forward buttons)
				scroll.resumeTo = scrollTop;
				scroll.y = scroll.resetTo;
				window.scrollTo(0, scroll.resetTo);
				scroll.resetTo = -1;
				return;
			}

			for (let i = 0, len = scroll.handlers.length; i < len; i++) if (scroll.handlers[i]) {
				scroll.handlers[i](scrollTop);
			}
		}
	},
	add: function (handler) {
		this.handlers.push(handler);
		handler(window.pageYOffset);
	},
	remove: function (handler) {
		const index = this.handlers.indexOf(handler);
		if (index !== -1) this.handlers.splice(index, 1);
	}
}

scroll.init();


const scrollbarWidth = (() => {
	if (typeof document === 'undefined') return 0;

	const box = document.createElement('div'), boxStyle = box.style;
	boxStyle.position = 'absolute';
	boxStyle.top = boxStyle.left = '-9999px';
	boxStyle.width = boxStyle.height = '100px';
	boxStyle.overflow = 'scroll';

	document.body.appendChild(box);
	const width = box.offsetWidth - box.clientWidth;
	document.body.removeChild(box);
	return width;
})();


const resize = {
	handlers: [],
	init: function () {
		this.viewportWidth = document.documentElement.clientWidth + scrollbarWidth;
		window.addEventListener('orientationchange', this.run, false);
		window.addEventListener('resize', this.debounce(this.run, 40), false);
		window.addEventListener('load', this.run, false);
	},
	run: function () {
		resize.viewportWidth = document.documentElement.clientWidth + scrollbarWidth;
		for (let i = 0, len = resize.handlers.length; i < len; i++) if (resize.handlers[i]) {
			resize.handlers[i](resize.viewportWidth);
		}
		scroll.run(0, true);
	},
	debounce: function (fn, time) {
		let timeout;
		return function (...args) {
			const functionCall = () => fn.apply(this, args);
			clearTimeout(timeout);
			timeout = setTimeout(functionCall, time);
		}
	},
	add: function (handler) {
		this.handlers.push(handler);
		handler(this.viewportWidth);
	},
	remove: function (handler) {
		const index = this.handlers.indexOf(handler);
		if (index !== -1) this.handlers.splice(index, 1);
	}
}

resize.init();

/*
 * ----------------------------------------------------------------
 * Utils
 * ----------------------------------------------------------------
 */

function animate (draw, duration, timing) {
	const start = performance.now();
	const animate = (time) => {
		if (animate.stop === true) return;
		let timeFraction = (time - start) / duration;
			timeFraction = timeFraction < 0 ? 0 : (timeFraction > 1 ? 1 : timeFraction);

		draw(timing ? timing(timeFraction) : timeFraction);
		if (timeFraction < 1) requestAnimationFrame(animate);
	}
	requestAnimationFrame(animate);
	return animate;
}

const prefix = (node, style, value) => {
	node.style['Webkit' + style] = value;
	node.style['Moz' + style] = value;
	node.style['ms' + style] = value;
	node.style['o' + style] = value;
	node.style[style] = value;
}

const wrapNode = (node, className) => {
	const wrap = document.createElement('div');
	if (className) wrap.classList.add(className);
	node.parentNode.insertBefore(wrap, node);
	wrap.appendChild(node);
	return wrap;
}

const isObject = (obj) => obj && typeof obj === 'object';
const merge = (target, source) => {
	if (!isObject(target) || !isObject(source)) return source;

	Object.keys(source).forEach(key => {
		if (Array.isArray(target[key]) && Array.isArray(source[key])) {
			target[key] = target[key].concat(source[key]);
		} else if (isObject(target[key]) && isObject(source[key])) {
			target[key] = merge(Object.assign({}, target[key]), source[key]);
		} else {
			target[key] = source[key];
		}
	});
	return target;
}

const enteredViewport = (element, callback, lazyness) => {
	let top, bottom;
	const onresize = () => {
		({ top, bottom } = element.getBoundingClientRect());
		top    += window.pageYOffset - window.innerHeight * ((lazyness || 0) + 1);
		bottom += window.pageYOffset + window.innerHeight *  (lazyness || 0);
	}
	const onscroll = (scrollTop) => {
		if (top > scrollTop || bottom < scrollTop) return;
		destroy(); callback();
	}
	const destroy = () => {
		scroll.remove(onscroll);
		resize.remove(onresize);
	}
	resize.add(onresize);
	scroll.add(onscroll);

	return { destroy: destroy };
}

const parallax = (element, speed, options) => {
	options = options || {};
	let top, bottom, height, coeff = speed, referenceEl = options.bgWrap ? options.bgWrap : element;
	const onscroll = (scrollTop) => {
		if (top > scrollTop + height || bottom < scrollTop) return;

		element.y = coeff * (scrollTop - top);
		if (element.bg) prefix(element.bg, 'transform', 'translateY(' + element.y + 'px) translateZ(0px)');
	}
	const onresize = () => {
		({ top, bottom } = referenceEl.getBoundingClientRect());
		top    += window.pageYOffset - (element.yOffset || 0); // yOffset fixes the ajax fade-in animation
		bottom += window.pageYOffset - (element.yOffset || 0);
		height  = window.innerHeight;

		// TODO: If you find better way to fix parallax on mobile please contact me
		coeff = speed * Math.min(1, window.innerWidth / window.innerHeight);

		const oldHeight = bottom - top;
		const newHeight = (oldHeight + (height - oldHeight) * coeff);
		if (element.bg) element.bg.style.height = newHeight + 'px';
		if (options.resizeCallback) options.resizeCallback(newHeight);
	}
	const destroy = () => {
		scroll.remove(onscroll);
		resize.remove(onresize);
		if (element.bg) {
			element.bg.style.removeProperty('height');
			prefix(element.bg, 'transform', '');
		}
	}
	resize.add(onresize);
	scroll.add(onscroll);

	return { destroy: destroy };
}

const imageLoaded = (element, callback) => {
	let image = new Image(), source = element.src;
	if (element.tagName != 'IMG') {
		source = element.getAttribute('data-src');
		if (!source) source = element.style.backgroundImage.slice(4, -1).replace(/['"]/g, "");
	}
	image.src = source;

	if (image.complete && image.naturalHeight !== 0) {
		callback(element, { error: false, wasComplete: true });
	} else {
		image.onload  = () => callback(element, { error: false });
		image.onerror = () => callback(element, { error: true  });
	}
	return { destroy: () => { image = image.onload = image.onerror = null; } }
}


const zoomParallaxEasing = BezierEasing(0.39, 0.575, 0.565, 1);
const zoomBG = document.querySelector('.zoom-overlay');
const zoom = (element, options) => { // TODO: add upscale / ignoreIntrinsic as an option
	const defaults = {
		image: element.tagName === 'IMG' ? element : {},
		bodyClassName: 'zoom-open',
		time: 260,
		margin: 40,
		scrollOffset: 60,
		wrap: null,
		parallax: false,
		zoomable: true,
		opened: false
	}
	options = {...defaults, ...options};

	if (!options.wrap) options.wrap = wrapNode(element);
	options.wrap.classList.add('zoom-wrap');

	const open = () => {
		if (options.bodyClassName === 'author-bio-open' && options.viewportWidth <= 768) {
			const url = element.querySelector('.post-link').getAttribute('href');
			if (url) {
				if (typeof loader.swup === 'object') loader.swup.loadPage({ url });
				else window.location.assign(url);
				return;
			}
		}

		options.opened = true;
		options.scrollY = window.pageYOffset;
		element.classList.add('zoomed');
		document.body.classList.add(options.bodyClassName);
		onresize();
		bindEvents();
		if (options.callback) options.callback(true);
	}

	const close = () => {
		options.opened = false;
		bindEvents(true);

		if (options.parallax) {
			const bg   = element.bg;
			element.bg = false; // Stops Background Parallax on Scroll
			prefix(bg, 'transform', 'translateY(0px)');
			animate(progress => {
				prefix(bg, 'transform', 'translateY(' + (element.y * progress) + 'px)');
				if (progress === 1) element.bg = bg;
			}, options.time, zoomParallaxEasing);
		}

		document.body.classList.remove(options.bodyClassName);
		element.classList.add('zoom-transition');
		element.classList.remove('zoomed');
		prefix(element, 'transform', '');
		setTimeout(() => element.classList.remove('zoom-transition'), options.time);
		if (options.callback) options.callback(false);
	}

	const onresize = (viewportWidth) => {
		const wrap   = options.wrap.getBoundingClientRect();
		const target = options.target ? options.target.getBoundingClientRect() : {
			width: document.documentElement.clientWidth,
        	height: document.documentElement.clientHeight,
        	left: 0,
        	top: 0
		};

		const naturalWidth = options.image.naturalWidth || target.width;
		const naturalHeight = options.image.naturalHeight || target.height;

		const scaleX = Math.min(naturalWidth, target.width - options.margin * 2) / wrap.width;
      	const scaleY = Math.min(naturalHeight, target.height - options.margin * 2) / wrap.height;
		const scale  = Math.min(scaleX, scaleY);

		if (options.bodyClassName === 'author-bio-open') {
			if (viewportWidth > -1) options.viewportWidth = viewportWidth - (options.opened ? scrollbarWidth : 0);
			if (options.opened && options.viewportWidth <= 768) {
				close();
				return;
			}
		}

		if (!options.opened) {
			options.zoomable = Math.abs(scale - 1) > 0.01 || options.parallax || options.bodyClassName === 'author-bio-open';
			element.classList[options.zoomable ? 'add' : 'remove']('zoomable');
			return;
		}

		let translateX = target.left - wrap.left;
		if (options.align === -1) { // aligned left
			translateX += wrap.width * (scale - 1) / 2;
		} else if (options.align === 1) { // aligned right
			translateX += (target.width - wrap.width) - wrap.width * (scale - 1) / 2;
		} else { // centered
			translateX += (target.width - wrap.width) / 2;
		}
		const translateY = target.top - wrap.top + (target.height - wrap.height) / 2;
		prefix(element, 'transform', `translate3d(${ translateX }px, ${ translateY }px, 0) scale(${ scale })`);
	}

	const onkeyup = (e) => {
		e.preventDefault();
		if (e.keyCode === 27) close();
	}

	const onscroll = (scrollTop) => {
		const scrollOffset = Math.abs(options.scrollY - scrollTop);
		if (scrollOffset > options.scrollOffset) close();
	}

	const onclick = (e) => {
		e.preventDefault();
		// If Command (macOS) or Ctrl (Windows) key pressed, stop processing and open the image in a new tab
		if (options.image.src && (e.metaKey || e.ctrlKey)) {
			return window.open(options.image.src, '_blank');
		}
		if (options.zoomable) {
			if (options.opened) close(); else open();
		}
	}

	const bindEvents = (unbind) => {
		const action = unbind ? 'remove' : 'add';
		window[action + 'EventListener']('keyup', onkeyup, false);
		scroll[action](onscroll);
		zoomBG[action + 'EventListener']('click', close, false);
	}

	const init = (destroy) => {
		const action = destroy ? 'remove' : 'add';
		element[action + 'EventListener']('click', onclick, false);
		resize[action](onresize);
	}
	init();

	return {
		open: open,
		close: close,
		destroy: () => {
			if (options.callback) options.callback(false);
			bindEvents(true);
			init(true);
		}
	}
}

/*
 * ----------------------------------------------------------------
 * Responsive Embeds
 * ----------------------------------------------------------------
 */

const responsiveEmbeds = {
	selectors: [
		'.post-content iframe:not(.reframe-off)',
		'object:not(.reframe-off)',
		'embed:not(.reframe-off)'
	],
	init: function () {
		this.selectors.forEach(selector => Reframe(selector));
	}
}

/*
 * ----------------------------------------------------------------
 * Images
 * ----------------------------------------------------------------
 */

const images = {
	loaded: false,
	init: function () {
		this.elements = document.querySelectorAll('.kg-image, .kg-gallery-image img');
		if (this.absent = !this.elements.length) {
			this.loaded = true; return;
		}

		for (let i = 0, len = this.elements.length; i < len; i++) { // may be better to be included as inline js
			var img = this.elements[i];
			if (img.parentNode.classList.contains('kg-gallery-image')) {
				img.parentNode.style.flex = (img.attributes.width.value / img.attributes.height.value) + ' 1 0%';
			}
		}

		let loadedImages = 0;
		for (let i = 0, len = this.elements.length; i < len; i++) {
			const el   = this.elements[i];
			const type = el.parentNode.classList.contains('kg-gallery-image') ? 'gallery' :
						 el.parentNode.classList.contains('kg-width-full')    ? 'full'    :
						 el.parentNode.classList.contains('kg-width-wide')    ? 'wide'    : 'normal';

			if (type === 'gallery') {
				const bgImg = document.createElement('div');
					  bgImg.className = 'background-image kg-image';
					  bgImg.style.backgroundImage = 'url(' + el.src + ')';

				wrapNode(el, 'image-wrap');
				el.className = 'placeholder';
				el.parentNode.bg = bgImg;
				el.parentNode.appendChild(bgImg);
			}

			el.imageLoaded = imageLoaded(el, () => {
				if (++loadedImages === len) { // imitates initial window.load() event
					images.loaded = true;
					resize.run();
				}

				el.zoom = zoom(type === 'gallery' ? el.parentNode : el, {
					wrap: type === 'gallery' ? el.parentNode.parentNode : null,
					parallax: false,
					image: el,
					margin: 30
				});
			});
		}
	},
	destroy: function () {
		for (let i = 0, len = this.elements.length; i < len; i++) {
			const el = this.elements[i];
			if (el.imageLoaded) el.imageLoaded.destroy();
			if (el.parallax) el.parallax.destroy();
			if (el.zoom) el.zoom.destroy();
		}
		this.elements = null;
		this.loaded = false;
	}
}

/*
 * ----------------------------------------------------------------
 * Prev/Next Post Section
 * ----------------------------------------------------------------
 */

const siblingPosts = {
	posts: [],
	init: function () {
		this.posts = document.querySelectorAll('.sibling-posts a');
		if (this.absent = !this.posts.length) return;

		for (let i = 0, len = this.posts.length; i < len; i++) {
			const post = this.posts[i];
			const bg = post.querySelector('.background-image .lazyload');
			if (bg) post.inView = enteredViewport(post, () => post.imageLoaded = imageLoaded(bg, () => {
				bg.style.backgroundImage = `url(${ bg.getAttribute('data-src') })`;
				bg.parentNode.classList.add('visible');
			}) );
		}
	},
	destroy: function () {
		for (let i = 0, len = this.posts.length; i < len; i++) {
			const post = this.posts[i];
			if (post.inView) post.inView.destroy();
			if (post.imageLoaded) post.imageLoaded.destroy();
		}
		this.posts = [];
	}
}


/*
 * ----------------------------------------------------------------
 * Syntax Highlighting
 * ----------------------------------------------------------------
 */

const highlight = {
	init: function () {
		const container = document.querySelector('.post-content');
		if (container) Prism.highlightAllUnder(container);
	}
}

/*
 * ----------------------------------------------------------------
 * Stupid Random Taglines
 * ----------------------------------------------------------------
 */

const taglines = {
	init: function () {
		const container = document.querySelector('.site-description');
		if (container && window.taglines) {
			container.innerHTML = window.taglines[Math.floor(Math.random() * window.taglines.length)];
		}
	}
}

const infinitescroll = {
	page: 1,
	loading: false,
	loaderTimeout: null,
	posts: null,
	request: null,
	url: window.location.href,
	init: function() {
		if (window.post_index) {
			if (this.url.charAt(this.url.length - 1) != '/') {
				this.url = this.url + '/';
			}

			$(window).scroll(this.onscroll.bind(this));
		}
	},
	onscroll: function() {
		if (this.page < window.max_pages && !this.loading && ($(window).scrollTop() + $(window).height() >= $(document).height())) {
					
			var nextPage = this.url + 'page/' + (this.page + 1);
			this.page += 1;
			this.loading = true;

			$('.posts-loading').fadeIn();
			this.loaderTimeout = setTimeout((function () {
				this.loaderTimeout = null;

				if (this.request) {
					return;
				} else {
					this.hideLoader();
				}
			}).bind(this), 2000);

			this.request = $.get(nextPage, (function (content) {
				this.request = null;
				this.posts = $($.parseHTML(content)).find('.post-card');

				if (this.loaderTimeout) {
					return;
				} else {
					this.hideLoader();
				}
			}).bind(this));
		}
	},
	hideLoader: function() {
		$('.post-feed').append(this.posts);
		$('.posts-loading').hide();
	}
}

/*
 * ----------------------------------------------------------------
 * Page Loading
 * ----------------------------------------------------------------
 */
$(document).ready(function() {
    responsiveEmbeds.init();
    images.init();
    siblingPosts.init();
	highlight.init();
	taglines.init();
	infinitescroll.init();
});