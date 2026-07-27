import { toast } from 'sonner';
import { z } from 'zod';
import * as Sentry from '@sentry/react';

import { authService } from '@/services/authService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v0';

class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

let consecutiveFailures = 0;
let isRefreshing = false;
let refreshSubscribers: Array<(success: boolean) => void> = [];

function subscribeTokenRefresh(cb: (success: boolean) => void) {
    refreshSubscribers.push(cb);
}

function onRefreshed(success: boolean) {
    refreshSubscribers.forEach((cb) => cb(success));
    refreshSubscribers = [];
}

async function request<T>(
    endpoint: string,
    options: RequestInit,
    schema?: z.ZodType<T>,
    isRetry = false,
): Promise<T> {
    const startTime = performance.now();

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers as Record<string, string>),
            },
        });

        const duration = performance.now() - startTime;

        if (!response.ok) {
            consecutiveFailures++;

            let detail = response.statusText;
            try {
                const body = await response.json();
                detail = body.detail ?? detail;
            } catch {}

            if (response.status === 401) {
                const isAuthEndpoint = endpoint.includes('/auth/refresh') || endpoint.includes('/auth/login');
                
                if (!isAuthEndpoint && !isRetry) {
                    if (isRefreshing) {
                        const refreshed = await new Promise<boolean>((resolve) => {
                            subscribeTokenRefresh(resolve);
                        });
                        if (refreshed) {
                            return request<T>(endpoint, options, schema, true);
                        }
                    } else {
                        isRefreshing = true;
                        try {
                            await authService.refreshToken();
                            isRefreshing = false;
                            onRefreshed(true);
                            return request<T>(endpoint, options, schema, true);
                        } catch {
                            isRefreshing = false;
                            onRefreshed(false);
                        }
                    }
                }

                Sentry.addBreadcrumb({
                    category: 'auth',
                    message: 'Session expired',
                    level: 'warning',
                    data: { endpoint, duration_ms: Math.round(duration) },
                });
                window.dispatchEvent(new CustomEvent('auth:expired'));
            } else if (response.status === 429) {
                toast.error('Too many requests — please slow down');
            }

            if (response.status >= 500) {
                Sentry.captureEvent({
                    message: `Backend 5xx: ${response.status} ${endpoint}`,
                    level: 'error',
                    tags: {
                        endpoint,
                        method: options.method || 'GET',
                        status_code: String(response.status),
                    },
                    extra: {
                        detail,
                        duration_ms: Math.round(duration),
                        consecutive_failures: consecutiveFailures,
                    },
                });
            }

            if (consecutiveFailures >= 3) {
                Sentry.captureEvent({
                    message: `Backend unreachable: ${consecutiveFailures} consecutive failures on ${endpoint}`,
                    level: 'error',
                    tags: {
                        endpoint,
                        method: options.method || 'GET',
                        status_code: String(response.status),
                    },
                    extra: {
                        consecutive_failures: consecutiveFailures,
                        duration_ms: Math.round(duration),
                    },
                });
            }

            throw new ApiError(detail, response.status);
        }

        consecutiveFailures = 0;

        if (duration > 5000) {
            Sentry.addBreadcrumb({
                category: 'performance',
                message: `Slow response: ${endpoint} (${Math.round(duration)}ms)`,
                level: 'warning',
                data: { endpoint, duration_ms: Math.round(duration) },
            });
        }

        const data = await response.json();
        if (schema) {
            return schema.parse(data);
        }
        return data as T;
    } catch (error) {
        const duration = performance.now() - startTime;

        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            consecutiveFailures++;
            Sentry.captureEvent({
                message: `Network error fetching ${endpoint}`,
                level: 'error',
                tags: {
                    endpoint,
                    method: options.method || 'GET',
                    error_type: 'network',
                },
                extra: {
                    duration_ms: Math.round(duration),
                    consecutive_failures: consecutiveFailures,
                    api_base_url: API_BASE_URL,
                },
            });

            if (consecutiveFailures >= 3) {
                Sentry.captureEvent({
                    message: `Backend down: ${consecutiveFailures} consecutive network failures`,
                    level: 'fatal',
                    tags: { endpoint },
                    extra: { consecutive_failures: consecutiveFailures },
                });
            }
        }

        if (!(error instanceof ApiError)) {
            consecutiveFailures++;
        }

        throw error;
    }
}

export const api = {
    get<T>(endpoint: string, schema?: z.ZodType<T>): Promise<T> {
        return request<T>(endpoint, { method: 'GET' }, schema);
    },

    post<T>(endpoint: string, data: unknown, schema?: z.ZodType<T>): Promise<T> {
        return request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }, schema);
    },

    put<T>(endpoint: string, data: unknown, schema?: z.ZodType<T>): Promise<T> {
        return request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) }, schema);
    },

    delete<T>(endpoint: string, schema?: z.ZodType<T>): Promise<T> {
        return request<T>(endpoint, { method: 'DELETE' }, schema);
    },

    patch<T>(endpoint: string, data: unknown, schema?: z.ZodType<T>): Promise<T> {
        return request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(data) }, schema);
    },
};
