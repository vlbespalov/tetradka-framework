export interface SessionData {
    jti: string;
    userId: string;
    login: string;
}
export declare function createSession(jti: string, userId: string, login: string): Promise<void>;
export declare function getSession(jti: string): Promise<SessionData | null>;
export declare function deleteSession(jti: string): Promise<void>;
//# sourceMappingURL=session.d.ts.map