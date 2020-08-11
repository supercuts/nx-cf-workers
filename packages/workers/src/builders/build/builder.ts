import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
} from '@angular-devkit/architect';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { BuildBuilderSchema } from './schema';
import * as child from 'child_process';

export function runBuilder(
  options: BuildBuilderSchema,
  context: BuilderContext
): Observable<BuilderOutput> {
  return of({ success: true }).pipe(
    tap(() => {
      context.logger.info('Builder ran for build' + JSON.stringify(context));
      try {
        child.spawn('wrangler',  ['build'], {cwd: context.currentDirectory});
      } catch(e) {
        context.logger.error(`"wrangler build" failed: ` + JSON.stringify(e))
      }
    })
  );
}

export default createBuilder(runBuilder);
