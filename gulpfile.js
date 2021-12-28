'use strict';
const gulp     = require('gulp');
const srcmaps  = require('gulp-sourcemaps')
const plumber  = require('gulp-plumber')
const notify   = require('gulp-notify')
const zip      = require('gulp-zip')
const postcss  = require('gulp-postcss')
const rollup   = require('rollup')
const babel    = require('rollup-plugin-babel')
const commonjs = require('rollup-plugin-commonjs')
const resolve  = require('rollup-plugin-node-resolve')
const { terser } = require('rollup-plugin-terser')

function styles() {
	const processors = [
		require('postcss-import'),
		require('postcss-mixins'),
		require('postcss-nested'),
		require('postcss-custom-properties')({ preserve: false }),
		require('autoprefixer')(),
		require('cssnano')( {
			preset: ['default', {
				calc: false,
				mergeLonghand: false // These conflict with processing nested calc() and env values().
			}]
		} )
	];

	return gulp.src('assets/postcss/styles.css')
		.pipe(plumber({
			errorHandler: error => {
				notify.onError({
					title: `Error in ${error.plugin}: ${error.message}`
				})(error);
			}
		}))
		.pipe(srcmaps.init())
		.pipe(postcss(processors))
		.pipe(srcmaps.write('./'))
		.pipe(gulp.dest('assets/built/'))
}

const read = {
	input: 'assets/js/script.js',
	output: {
		sourcemap: true
	},
	plugins: [
		resolve(),
		commonjs(),
		babel({
			babelrc: false,
			presets: [
				[
					'@babel/preset-env'
				]
            ],
            plugins: [
                ["prismjs", {
                    "languages": ["javascript", "css", "markup", "csharp", "python"]
                }]
            ]
		}),

	]
}

const write = {
	output: {
		file: 'assets/built/script.min.js',
		name: 'script',
		format: 'iife',
		sourcemap: true,
	},
	plugins: [],
}

async function scripts() {
	const bundle = await rollup.rollup(read)
	await bundle.write(write)
}

function watch() {
    gulp.watch('assets/postcss/**/*.css', styles);
	gulp.watch('assets/js/**/*.js', scripts);
}

function bundle() {
	const {name, version} = require('./package.json');
	const filename = `${name}-${version}.zip`;

	return gulp.src([
		'**',
        '!gulpfile.js', '!package-lock.json',
        '!assets/postcss', '!assets/postcss/**',
		'!assets/js', '!assets/js/**',
		'!node_modules', '!node_modules/**'
		])
		.pipe(zip(filename))
		.pipe(gulp.dest('.'));
}

// $ gulp: Builds, prefixes, and minifies CSS files; concencates and minifies JS files; watches for changes.
exports.default = gulp.parallel( styles, scripts, watch );
// $ gulp build: Builds, prefixes, and minifies CSS files; concencates and minifies JS files. For deployments.
exports.build = gulp.parallel( styles, scripts );
// $ gulp bundle: Builds and bundles theme into a ZIP file to simplify theme installation.
exports.bundle = gulp.series( exports.build, bundle );
