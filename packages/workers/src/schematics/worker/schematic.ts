import {
  apply,
  applyTemplates,
  chain,
  mergeWith,
  move,
  renameTemplateFiles,
  filter,
  Rule,
  SchematicContext,
  url
} from '@angular-devkit/schematics';
import {
  addDepsToPackageJson,
  addProjectToNxJsonInTree,
  names,
  offsetFromRoot,
  projectRootDir,
  ProjectType,
  toFileName,
  updateWorkspace
} from '@nrwl/workspace';
import { WorkersSchematicSchema } from './schema';
import * as fs from 'fs';
import axios, { AxiosResponse } from 'axios';
import * as tar from 'tar-fs';
import * as gunzip from 'gunzip-maybe';
import * as path from 'path';

/**
 * Depending on your needs, you can change this to either `Library` or `Application`
 */
const projectType = ProjectType.Application;

interface NormalizedSchema extends WorkersSchematicSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
}

function normalizeOptions(options: WorkersSchematicSchema): NormalizedSchema {
  const name = toFileName(options.name);
  const projectDirectory = options.directory
    ? `${toFileName(options.directory)}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${projectRootDir(projectType)}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags
  };
}

async function addFiles(options: NormalizedSchema, c: SchematicContext): Promise<{rule: Rule, dependencies: Record<string, string>, devDependencies: Record<string, string>}> {
  let projectPath: string | undefined = (c.schematic.description as any).path;
  const downloadUrl = options.template + 'archive/master.tar.gz';
  const urlSplit = options.template.split('/');

  // Last slash
  urlSplit.pop();

  const repo = urlSplit.pop();
  const owner = urlSplit.pop();
  console.log('onwer', owner)
  console.log('repo', repo)
  let response: AxiosResponse;
  let filesDir = path.resolve(projectPath, 'files');
  if(axios && projectPath) {
    const ownerPath = path.resolve(projectPath, owner);
    if(!fs.existsSync(ownerPath)) {
      fs.mkdirSync(ownerPath);
    }
    const repoPath = path.resolve(ownerPath, repo);
    if(!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath)
    }
    try {
      response = await axios.get(downloadUrl, {
        responseType: 'stream'
      });
    } catch (e) {
      c.logger.error('github fetch failed' + JSON.stringify(e))
    }
    if (response && response.status <= 299) {
      filesDir = repoPath;
      await (() => {
        const extract = tar.extract(filesDir, {
          ignore: (name, header) => {
            return !header.name;
          },
          map: (header) => {
            const splitPath = header.name.split('/');
            splitPath.shift();
            header.name = splitPath.join('/');
            return header;
          }
        });
        return new Promise((resolve, reject) => {
          extract.on('finish', () => {
            console.log('resolve')
            resolve();
          });
          extract.on('error', (err) => {
            console.log('error', err)
            reject();
          });
          response.data.pipe(gunzip()).pipe(extract);
        });
      })();
    }
  } else {
    c.logger.info('axios undefined or tests');
  }
  try {
    const packageLockPath = path.join(filesDir, "package-lock.json");
    fs.unlinkSync(packageLockPath);
  } catch(e) {c.logger.info('no package-lock.json' + JSON.stringify(e))}
  const packagePath = path.join(filesDir, "package.json");
  let packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
  fs.unlinkSync(packagePath);
  const dependencies: {[index: string]: string} = packageJson['dependencies'] || {}
  const devDependencies: {[index: string]: string} = packageJson['devDependencies'] || {}

  const rule = mergeWith(
    apply(url(`./files`), [
      filter(file => !file.endsWith('package.json')),
      renameTemplateFiles(),
      applyTemplates({
        ...options,
        ...names(options.name),
        offsetFromRoot: offsetFromRoot(options.projectRoot)
      }),
      move(options.projectRoot)
    ])
  );
  return {rule, dependencies, devDependencies}
}

export default function(options: WorkersSchematicSchema): Rule {
  const normalizedOptions = normalizeOptions(options);
  return async (t, c) => {
    c.logger.info(t + "\n" + c);
    const {rule: addFilesRule, dependencies, devDependencies} = await addFiles(normalizedOptions, c)
    return chain([
      updateWorkspace((workspace) => {
        workspace.projects
          .add({
            name: normalizedOptions.projectName,
            root: normalizedOptions.projectRoot,
            sourceRoot: `${normalizedOptions.projectRoot}/src`,
            projectType
          })
          .targets.add({
            name: 'build',
            builder: '@supercuts/workers:build'
          })

      }),
      addProjectToNxJsonInTree(normalizedOptions.projectName, {
        tags: normalizedOptions.parsedTags
      }),
      addFilesRule,
      addDepsToPackageJson(
        dependencies,
        devDependencies
      )
    ]);
  };
}

