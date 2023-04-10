import * as cache from "@actions/cache";
import * as core from "@actions/core";

import { Events, Inputs, Outputs, State } from "./constants";
import { IStateProvider } from "./stateProvider";
import * as utils from "./utils/actionUtils";

async function restoreImpl(
    stateProvider: IStateProvider
): Promise<undefined> {
    try {
        if (!utils.isCacheFeatureAvailable()) {
            core.setOutput(Outputs.CacheHit, "false");
            return;
        }

        // Validate inputs, this can cause task failure
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        const enableCrossOsArchive = utils.getInputAsBool(
            Inputs.EnableCrossOsArchive
        );
        const failOnCacheMiss = utils.getInputAsBool(Inputs.FailOnCacheMiss);
        const lookupOnly = utils.getInputAsBool(Inputs.LookupOnly);

        const jsonString = core.getInput(Inputs.Json);

        if (jsonString != "") {
           const json = JSON.parse(jsonString); // might throw SyntaxError
           const cacheMisses: Object[] = [];
           const cacheHits: Object[] = [];

	   core.info(`jsonString: ${jsonString}`);
	   core.info(`json: ${json}`);
           json.forEach( async value => {

	     core.info(`value: ${value}`);
	     if (value instanceof Object) {

	       // slow, because it blocks waiting for each path to be restored
               const cacheKey = await cache.restoreCache(
		 [value['path']],
		 value['key'],
		 value['restore-keys'],
		 { lookupOnly: lookupOnly },
		 enableCrossOsArchive
               );

               if (!cacheKey) {
		 if (failOnCacheMiss) {
		   throw new Error(
                     `Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input path: ${value['path']}. Input key: ${value['key']}`
                   );
		 }
		 core.info(
                   `Cache not found for input path: ${value['path']} keys: ${[
                    value['key'],
                    ...value['restore-keys']
                ].join(", ")}`
		 );

                 cacheMisses.push(value);
		 return;
               }

               // Store the matched cache key in states
               // old API used one path per call and cache-matched-key had only one return value
               stateProvider.setState(State.CacheMatchedKey, cacheKey);

               const isExactKeyMatch = utils.isExactKeyMatch(
		 core.getInput(Inputs.Key, { required: true }),
		 cacheKey
               );

               //core.setOutput(Outputs.CacheHit, isExactKeyMatch.toString());
	       cacheHits.push(value);

               if (lookupOnly) {
		 core.info(`Cache found for ${value['path']} and can be restored from key: ${cacheKey}`);
               } else {
		 core.info(`Cache restored for ${value['path']} from key: ${cacheKey}`);
               }
	     }
	   });
          core.setOutput(Outputs.CacheHits, JSON.stringify(cacheHits));
          core.setOutput(Outputs.CacheMisses, JSON.stringify(cacheMisses));
	  return;
        }

        const primaryKey = core.getInput(Inputs.Key);
        stateProvider.setState(State.CachePrimaryKey, primaryKey);

        const restoreKeys = utils.getInputAsArray(Inputs.RestoreKeys);
        const cachePath = utils.getInputAsArray(Inputs.Path);
        const cachePaths = utils.getInputAsArray(Inputs.Paths);

        if (cachePath.length > 0) cachePaths.push(cachePath.join('|'));

	cachePaths.forEach( async (path) => {

	  // slow, because it blocks waiting for each path to be restored
          const cacheKey = await cache.restoreCache(
            [path],
            primaryKey,
            restoreKeys,
            { lookupOnly: lookupOnly },
            enableCrossOsArchive
          );

          if (!cacheKey) {
            if (failOnCacheMiss) {
              throw new Error(
                    `Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input path: ${path}. Input key: ${primaryKey}`
                );
            }
            core.info(
                `Cache not found for input path: ${path} keys: ${[
                    primaryKey,
                    ...restoreKeys
                ].join(", ")}`
            );

            return;
          }

          // Store the matched cache key in states
          // old API used one path per call and cache-matched-key had only one return value
          stateProvider.setState(State.CacheMatchedKey, cacheKey);

          const isExactKeyMatch = utils.isExactKeyMatch(
            core.getInput(Inputs.Key, { required: true }),
            cacheKey
          );

          core.setOutput(Outputs.CacheHit, isExactKeyMatch.toString());
          if (lookupOnly) {
            core.info(`Cache found for ${path} and can be restored from key: ${cacheKey}`);
          } else {
            core.info(`Cache restored for ${path} from key: ${cacheKey}`);
          }
	});
        return;
    } catch (error: unknown) {
        core.setFailed((error as Error).message);
    }
}

export default restoreImpl;
