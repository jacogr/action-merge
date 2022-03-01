// SPDX-License-Identifier: Apache-2.0

import type { components } from '@octokit/openapi-types';

import { context, getOctokit } from '@actions/github';
import { getInput, setFailed } from '@actions/core';

type PR = components['schemas']['pull-request-simple'];

// TODO We may want to make these configurable
const RETRY_MAX = 30;
const RETRY_DELAY = 60_000;

// check that the context is indeed for a PR
function isPR (pr: unknown): pr is PR {
	return !!pr;
}

// check that the stategy is correct
function isStrategy (strategy: string): strategy is 'merge' | 'rebase' | 'squash' {
	return ['merge', 'rebase', 'squash'].includes(strategy);
}

// split a variable into parts and trim along the way
function getInputs (type: 'checks' | 'labels'): string[] {
	return getInput(type)
		.split(',')
		.map((s) => s.trim());
}

// wait for a pre-determined time
async function wait (): Promise<void> {
	return new Promise((resolve): void => {
		setTimeout(() => resolve(), RETRY_DELAY)
	});
}

async function main () {
	// bail if we are not called as part of a PR
	const pr = context.payload.pull_request;

	if (!isPR(pr)) {
		throw new Error('action needs to be run as part of a pull request');
	}

	// get the variables defined in the action
	const checks = getInputs('checks');
	const labels = getInputs('labels');
	const strategy = getInput('strategy');

	if (!isStrategy(strategy)) {
		throw new Error(`Invalid merge stategy found: ${strategy}`);
	}

	// create our client
	const client = getOctokit(getInput('token'));
	let retries = RETRY_MAX;

	while (true) {
		// retrieve the current status for this PR
		const { data: prData } = await client.rest.pulls.get({
			...context.repo,
			pull_number: pr.number
		});

		if (
			// the current head sha needs to match what we received
			prData.head.sha !== pr.head.sha ||
			// one of the labels needs to match the defined labels
			!prData.labels.some(({ name }) => labels.includes(name || ''))
		) {
			return;
		}

		// retrieve the current statusses for this PR
		const { data: checkData } = await client.rest.checks.listForRef({
			...context.repo,
			ref: pr.head.sha
		});

		// ensure all checks have passed
		if (
			checkData.check_runs.filter(({ conclusion, name, status }) =>
				checks.includes(name) &&
				status === 'completed' &&
				conclusion === 'success'
			).length === checks.length
		) {
			// merge (we may want to leave comments in the future as well)
			return client.rest.pulls.merge({
				...context.repo,
				pull_number: pr.number,
				merge_method: strategy
			});;
		}

		// while we have retries remaining, wait a bit...
		if (--retries) {
			await wait();
		} else {
			throw new Error('Maximum number of retries');
		}
	}
};

main().catch(({ message }) => setFailed(message));
