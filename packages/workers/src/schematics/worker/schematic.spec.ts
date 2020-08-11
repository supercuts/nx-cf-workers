import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { createEmptyWorkspace } from '@nrwl/workspace/testing';
import { join } from 'path';

import { WorkersSchematicSchema } from './schema';
jest.mock('axios')

describe('workers schematic', () => {
  let appTree: Tree;
  const options: WorkersSchematicSchema = { name: 'test' };

  const testRunner = new SchematicTestRunner(
    '@supercuts/workers',
    join(__dirname, '../../../collection.json')
  );

  beforeEach(() => {
    appTree = createEmptyWorkspace(Tree.empty());
  });


  it('should run successfully', async () => {
      const tree = await testRunner.runSchematicAsync('worker', options, appTree).toPromise()
      console.log('tree', tree);
  }, 20000);
});
