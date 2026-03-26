// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Agent management for A2A applications.
 */

import * as fs from "node:fs";
import type { AgentCard } from "@a2a-js/sdk";
import { DefaultAgentCardResolver } from "@a2a-js/sdk/client";
import type { AgentURLAndCustomHeaders } from "../types.js";

/**
 * Manages A2A agent cards keyed by user-defined agent IDs.
 *
 * Agents are configured via a dict mapping agent_id to config, or a JSON file path.
 */
export class A2AAgents {
    private config: Record<string, Record<string, unknown>>;
    private agents: Record<string, AgentURLAndCustomHeaders> = {};
    private initErrors: Record<string, string> = {};
    private initialized = false;
    private initPromise: Promise<void> | null = null;
    private readonly timeout: number;

    /**
     * Initialize the agent manager.
     *
     * @param agents - Agent config as:
     *   - object: {"agent-id": {"url": "https://...", "custom_headers": {"X-API-Key": "..."}}}
     *   - string: path to agents.json file with the same structure
     *   - null: empty, add agents later
     * @param opts.timeout - HTTP timeout in seconds for fetching agent cards (default: 15s).
     */
    constructor(
        agents: Record<string, Record<string, unknown>> | string | null = null,
        opts?: { timeout?: number },
    ) {
        this.timeout = opts?.timeout ?? 15.0;
        this.config = this.loadConfig(agents);
    }

    /** Load and validate agent config. */
    private loadConfig(
        agents: Record<string, Record<string, unknown>> | string | null,
    ): Record<string, Record<string, unknown>> {
        if (agents === null) {
            return {};
        }

        if (typeof agents === "string") {
            const text = fs.readFileSync(agents, "utf-8");
            return JSON.parse(text) as Record<string, Record<string, unknown>>;
        }

        return { ...agents };
    }

    /** Lazily fetch all agent cards on first use (double-check locking). */
    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;

        // Single-flight pattern
        if (this.initPromise === null) {
            this.initPromise = this.doInitialize();
        }
        await this.initPromise;
    }

    private async doInitialize(): Promise<void> {
        if (this.initialized) return;

        if (Object.keys(this.config).length === 0) {
            console.warn("No agents configured");
            this.initialized = true;
            return;
        }

        const entries = Object.entries(this.config);
        const results = await Promise.allSettled(
            entries.map(([agentId, cfg]) => this.fetchAgent(agentId, cfg)),
        );

        this.initErrors = {};
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === "rejected") {
                const aid = entries[i][0];
                const url = this.config[aid]?.url ?? "unknown";
                const reason = result.reason;
                const errorMsg = `${(reason as Error)?.constructor?.name ?? "Error"}: ${reason}`;
                this.initErrors[aid] = errorMsg;
                console.error(`Error loading agent '${aid}' from ${url}: ${errorMsg}`);
            }
        }

        if (Object.keys(this.agents).length > 0) {
            console.info(`Successfully initialized ${Object.keys(this.agents).length} agent(s)`);
        } else {
            console.warn("No agents were successfully initialized");
        }

        this.initialized = true;
    }

    /** Fetch a single agent card and register it. */
    private async fetchAgent(agentId: string, config: Record<string, unknown>): Promise<void> {
        const url = config.url as string;
        const customHeaders = (config.custom_headers as Record<string, string>) ?? {};

        const [baseUrl, cardPath] = this.parseAgentCardUrl(url);
        const resolver = new DefaultAgentCardResolver({
            fetchImpl: this.createFetchImpl(customHeaders),
        });
        const agentCard = await resolver.resolve(baseUrl, cardPath);

        this.agents[agentId] = {
            agentCard,
            customHeaders,
        };
    }

    /** Create a fetch implementation that applies the configured timeout and custom headers. */
    private createFetchImpl(customHeaders: Record<string, string>): typeof fetch {
        const wrappedFetch: typeof fetch = (input, init?) => {
            const timeoutSignal = AbortSignal.timeout(this.timeout * 1000);
            const signal =
                init?.signal != null
                    ? AbortSignal.any([init.signal, timeoutSignal])
                    : timeoutSignal;
            const mergedInit = {
                ...init,
                signal,
                headers: {
                    ...(init?.headers as Record<string, string> | undefined),
                    ...customHeaders,
                },
            };
            return fetch(input, mergedInit);
        };
        wrappedFetch.preconnect = fetch.preconnect;
        return wrappedFetch;
    }

    /** Parse agent card URL into base_url and card_path. */
    private parseAgentCardUrl(url: string): [string, string] {
        const parsed = new URL(url);
        const baseUrl = `${parsed.protocol}//${parsed.host}`;
        const cardPath = parsed.pathname;
        return [baseUrl, cardPath];
    }

    /**
     * Register a new agent at runtime.
     *
     * @param agentId - User-defined agent identifier.
     * @param url - Agent card URL.
     * @param customHeaders - Optional custom HTTP headers.
     *
     * @throws Error if agentId is already registered.
     */
    async addAgent(
        agentId: string,
        url: string,
        customHeaders?: Record<string, string>,
    ): Promise<void> {
        await this.ensureInitialized();
        if (agentId in this.agents) {
            throw new Error(`Agent '${agentId}' is already registered`);
        }
        const config: Record<string, unknown> = {
            url,
            custom_headers: customHeaders ?? {},
        };
        await this.fetchAgent(agentId, config);
    }

    /**
     * Retrieve agent by ID.
     *
     * @param agentId - User-defined agent identifier.
     *
     * @returns AgentURLAndCustomHeaders, or null if not found.
     */
    async getAgent(agentId: string): Promise<AgentURLAndCustomHeaders | null> {
        await this.ensureInitialized();
        return this.agents[agentId] ?? null;
    }

    /**
     * Get errors from the most recent initialization attempt.
     *
     * @returns Object mapping agent_id to error message for agents that failed to load.
     */
    get initializationErrors(): Record<string, string> {
        return { ...this.initErrors };
    }

    /**
     * Get all registered agents.
     *
     * @returns Object mapping agent_id to AgentURLAndCustomHeaders.
     */
    async getAgents(): Promise<Record<string, AgentURLAndCustomHeaders>> {
        await this.ensureInitialized();
        return { ...this.agents };
    }

    /**
     * Format a single agent card into a summary object.
     *
     * @param card - The agent card to format.
     * @param detail - Detail level — "name", "basic", "skills", or "full".
     *
     * @returns Summary object for the agent.
     */
    private formatAgentForLlm(
        card: AgentCard,
        detail: "name" | "basic" | "skills" | "full",
    ): Record<string, unknown> {
        if (detail === "name") {
            return { name: card.name };
        }
        if (detail === "basic") {
            return { name: card.name, description: card.description };
        }
        if (detail === "skills") {
            const skillNames = card.skills ? card.skills.map((s) => s.name) : [];
            return {
                name: card.name,
                description: card.description,
                skills: skillNames,
            };
        }
        // "full"
        const skills: Record<string, unknown>[] = [];
        if (card.skills) {
            for (const s of card.skills) {
                skills.push({ name: s.name, description: s.description ?? "" });
            }
        }
        return {
            name: card.name,
            description: card.description,
            skills,
        };
    }

    /**
     * Generate summary for a single agent.
     *
     * @param agentId - User-defined agent identifier.
     * @param detail - Detail level — "name", "basic", "skills", or "full".
     *
     * @returns Summary object for the agent, or null if not found.
     */
    async getAgentForLlm(
        agentId: string,
        detail: "name" | "basic" | "skills" | "full" = "basic",
    ): Promise<Record<string, unknown> | null> {
        await this.ensureInitialized();
        const agent = this.agents[agentId];
        if (!agent) {
            return null;
        }
        return this.formatAgentForLlm(agent.agentCard, detail);
    }

    /**
     * Generate summary of all agents.
     *
     * @param detail - Detail level — "name", "basic", "skills", or "full".
     *
     * @returns Object mapping agent_id to summary object, sorted by agent_id.
     */
    async getAgentsForLlm(
        detail: "name" | "basic" | "skills" | "full" = "basic",
    ): Promise<Record<string, Record<string, unknown>>> {
        await this.ensureInitialized();
        const result: Record<string, Record<string, unknown>> = {};
        const sortedKeys = Object.keys(this.agents).sort();
        for (const agentId of sortedKeys) {
            result[agentId] = this.formatAgentForLlm(this.agents[agentId].agentCard, detail);
        }
        return result;
    }
}
