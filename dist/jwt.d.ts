export interface JwtPayload {
    sub: string;
    login: string;
    jti: string;
}
export declare function signToken(userId: string, login: string): {
    token: string;
    jti: string;
};
export declare function verifyToken(token: string): JwtPayload;
//# sourceMappingURL=jwt.d.ts.map