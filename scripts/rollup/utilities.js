/* [Imports] */
import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import chalk from 'chalk';
import Low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import { dirname, join } from 'path';
import commonJS from 'rollup-plugin-commonjs';
import copy from 'rollup-plugin-copy';
import filesize from 'rollup-plugin-filesize';
import injectProcessEnv from 'rollup-plugin-inject-process-env';
import { fileURLToPath } from 'url';
import modules from '../../modules.json';
import fs from 'fs';
import {
  BUILD_PATH,
  DATABASE_KEY,
  DATABASE_NAME,
  MODULES_PATH,
  NODE_MODULES_PATTERN,
  SOURCE_PATH,
  SOURCE_PATTERN,
  SUPPRESSED_WARNINGS,
} from './constants.js';

/* [Main] */
let fullDatabasePath = join(
  dirname(fileURLToPath(import.meta.url)),
  `${DATABASE_NAME}.json`
);
let adapter = new FileSync(fullDatabasePath);
let database = new Low(adapter);

function getTimestamp() {
  return database.get(DATABASE_KEY).value() ?? 0;
}

function updateTimestamp() {
  let newTimestamp = new Date().getTime();
  database.set(DATABASE_KEY, newTimestamp).write();
}

// Function takes in relative paths, for cleaner logging
function isFolderModified(relativeFolderPath, storedTimestamp) {
  let fullFolderPath = toFullPath(relativeFolderPath);

  let contents = fs.readdirSync(fullFolderPath);
  for (let content of contents) {
    let relativeContentPath = join(relativeFolderPath, content);
    let fullContentPath = join(fullFolderPath, content);

    let stats = fs.statSync(fullContentPath);

    // If is folder, recurse. If found something modified, stop early
    if (
      stats.isDirectory() &&
      isFolderModified(relativeContentPath, storedTimestamp)
    ) {
      return true;
    }

    // Is file. Compare timestamps to see if stop early
    if (stats.mtimeMs > storedTimestamp) {
      console.log(chalk.grey(`• File modified: ${relativeContentPath}`));
      return true;
    }
  }

  return false;
}

function removeDuplicates(array) {
  return [...new Set(array)];
}

function makeDefaultConfig() {
  return {
    onwarn(warning, warn) {
      if (SUPPRESSED_WARNINGS.includes(warning.code)) return;

      warn(warning);
    },
    plugins: [
      typescript(),
      babel({
        babelHelpers: 'bundled',
        extensions: ['.ts', '.tsx'],
        include: [SOURCE_PATTERN],
      }),
      resolve({
        // Source Academy's modules run in a browser environment. The default setting (false) may
        // cause compilation issues when using some imported packages.
        // https://github.com/rollup/plugins/tree/master/packages/node-resolve#browser
        browser: true,
        // Tells rollup to look for locally installed modules instead of preferring built-in ones.
        // Node's built-in modules include `fs` and `path`, which the jsdom browser environment does
        // not have.
        // https://github.com/rollup/plugins/tree/master/packages/node-resolve#preferbuiltins
        preferBuiltins: false,
      }),
      commonJS({
        include: NODE_MODULES_PATTERN,
      }),
      injectProcessEnv({
        NODE_ENV: process.env.NODE_ENV,
      }),

      filesize({
        showMinifiedSize: false,
        showGzippedSize: false,
      }),
    ],
  };
}

function bundleNameToSourceFolder(bundleName) {
  // Root relative path
  return `${SOURCE_PATH}bundles/${bundleName}/`;
}

function tabNameToSourceFolder(tabName) {
  // Root relative path
  return `${SOURCE_PATH}tabs/${tabName}/`;
}

function toFullPath(rootRelativePath) {
  return join(process.cwd(), rootRelativePath);
}

/* [Exports] */
export function getRollupBundleNames(skipUnmodified) {
  // All module bundles
  let moduleNames = Object.keys(modules);

  // Skip modules whose files haven't been modified
  console.log('');
  if (skipUnmodified) {
    let storedTimestamp = getTimestamp();
    console.log(
      chalk.grey(
        `Quick rebuild mode (newer than ${new Date(
          storedTimestamp
        ).toLocaleString()}):`
      )
    );

    moduleNames = moduleNames.filter((moduleName) => {
      // Check module bundle
      let relativeBundleFolderPath = bundleNameToSourceFolder(moduleName);
      if (isFolderModified(relativeBundleFolderPath, storedTimestamp))
        return true;

      // Check each module tab
      for (let tabName of modules[moduleName].tabs) {
        let relativeTabFolderPath = tabNameToSourceFolder(tabName);
        if (isFolderModified(relativeTabFolderPath, storedTimestamp))
          return true;
      }

      return false;
    });
  }

  // All module tabs
  let tabNames = moduleNames.flatMap((moduleName) => modules[moduleName].tabs);
  tabNames = removeDuplicates(tabNames);

  return {
    bundleNames: moduleNames,
    tabNames,
  };
}

export function bundleNamesToConfigs(names) {
  let defaultConfig = makeDefaultConfig();

  console.log(chalk.greenBright('Configured module bundles:'));
  let configs = names.map((bundleName) => {
    console.log(`• ${chalk.blueBright(bundleName)}`);

    return {
      ...defaultConfig,

      input: `${bundleNameToSourceFolder(bundleName)}index.ts`,
      output: {
        file: `${BUILD_PATH}bundles/${bundleName}.js`,
        format: 'iife',
      },
    };
  });

  return configs;
}

export function tabNamesToConfigs(names) {
  let defaultConfig = makeDefaultConfig();

  console.log(chalk.greenBright('Configured module tabs:'));
  let configs = names.map((tabName) => {
    console.log(`• ${chalk.blueBright(tabName)}`);

    return {
      ...defaultConfig,

      input: `${tabNameToSourceFolder(tabName)}index.tsx`,
      output: {
        file: `${BUILD_PATH}tabs/${tabName}.js`,
        format: 'iife',

        globals: {
          react: 'React',
          'react-dom': 'ReactDom',
        },
      },
      external: ['react', 'react-dom'],
    };
  });

  return configs;
}

export function getFinalPlugins() {
  // Run these only once, at the end
  return [
    copy({
      targets: [{ src: MODULES_PATH, dest: BUILD_PATH }],
    }),
    {
      name: 'lowdb-timestamp',
      buildEnd(error) {
        if (error === undefined) updateTimestamp();
      },
    },
  ];
}
