import * as cache from "@actions/cache";
import * as core from "@actions/core";

import { Events, Inputs, ListInputs, ListOutputs as Outputs, State } from "./constants";
import { IStateProvider } from "./stateProvider";
import * as utils from "./utils/actionUtils";

async function restoreListImpl(
    stateProvider: IStateProvider
): Promise<undefined> {
    try {
        if (!utils.isCacheFeatureAvailable()) {
            core.setOutput(Outputs.CacheHits, "[]");
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

        const jsonString = core.getInput(ListInputs.Json);

	const json = JSON.parse(jsonString); // might throw SyntaxError
	const cacheMisses: Object[] = [];
	const cacheHits: Object[] = [];

	// Asynchronously run the next block of code over all elements in the JSON list.
	// There will be side effects; the cacheMisses and cacheHits lists will be populated.

	await Promise.all(json.map( async value => {

	    if (value instanceof Object) {

		const restoreKeys = value['restore-keys'] || [];

		const cacheKey = await cache.restoreCache(
		    [value['path']],
		    value['key'],
		    restoreKeys,
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
			    ...restoreKeys
			].join(", ")}`
		    );

		    cacheMisses.push(value);
		    return;
		}

		// Store the matched cache key in states
		// old API used one path per call and cache-matched-key had only one return value
		stateProvider.setState(State.CacheMatchedKey, cacheKey);

		const isExactKeyMatch = utils.isExactKeyMatch(value['key'], cacheKey);

		cacheHits.push(value);

		if (lookupOnly) {
		    core.info(`Cache found for ${value['path']} and can be restored from key: ${cacheKey}`);
		} else {
		    core.info(`Cache restored for ${value['path']} from key: ${cacheKey}`);
		}
	    }
	}));
	core.setOutput(Outputs.CacheHits, JSON.stringify(cacheHits));
	core.setOutput(Outputs.CacheMisses, JSON.stringify(cacheMisses));
	core.info(JSON.stringify(cacheMisses));
    } catch (error: unknown) {
        core.setFailed((error as Error).message);
    }
}

export default restoreListImpl;
