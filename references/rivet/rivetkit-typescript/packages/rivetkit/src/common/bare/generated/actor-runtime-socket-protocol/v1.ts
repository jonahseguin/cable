// @generated - post-processed by build.rs
import * as bare from "@rivetkit/bare-ts"

const DEFAULT_CONFIG = /* @__PURE__ */ bare.Config({})

export type f64 = number
export type i32 = number
export type i64 = bigint
export type u32 = number
export type u64 = bigint

/**
 * The schema version rides in the vbare embedded-version prefix of every
 * frame, so ClientHello carries no version or authentication fields.
 */
export type ClientHello = null

export type HelloOk = {
    /**
     * Largest frame payload the server accepts and will send.
     */
    readonly maxFrameBytes: u32
}

export function readHelloOk(bc: bare.ByteCursor): HelloOk {
    return {
        maxFrameBytes: bare.readU32(bc),
    }
}

export function writeHelloOk(bc: bare.ByteCursor, x: HelloOk): void {
    bare.writeU32(bc, x.maxFrameBytes)
}

export type HelloRejectUnsupportedVersion = null

export type ServerHello =
    | { readonly tag: "HelloOk"; readonly val: HelloOk }
    | { readonly tag: "HelloRejectUnsupportedVersion"; readonly val: HelloRejectUnsupportedVersion }

export function readServerHello(bc: bare.ByteCursor): ServerHello {
    const offset = bc.offset
    const tag = bare.readU8(bc)
    switch (tag) {
        case 0:
            return { tag: "HelloOk", val: readHelloOk(bc) }
        case 1:
            return { tag: "HelloRejectUnsupportedVersion", val: null }
        default: {
            bc.offset = offset
            throw new bare.BareError(offset, "invalid tag")
        }
    }
}

export function writeServerHello(bc: bare.ByteCursor, x: ServerHello): void {
    switch (x.tag) {
        case "HelloOk": {
            bare.writeU8(bc, 0)
            writeHelloOk(bc, x.val)
            break
        }
        case "HelloRejectUnsupportedVersion": {
            bare.writeU8(bc, 1)
            break
        }
    }
}

export function encodeServerHello(x: ServerHello, config?: Partial<bare.Config>): Uint8Array {
    const fullConfig = config != null ? bare.Config(config) : DEFAULT_CONFIG
    const bc = new bare.ByteCursor(
        new Uint8Array(fullConfig.initialBufferLength),
        fullConfig,
    )
    writeServerHello(bc, x)
    return new Uint8Array(bc.view.buffer, bc.view.byteOffset, bc.offset)
}

export function decodeServerHello(bytes: Uint8Array): ServerHello {
    const bc = new bare.ByteCursor(bytes, DEFAULT_CONFIG)
    const result = readServerHello(bc)
    if (bc.offset < bc.view.byteLength) {
        throw new bare.BareError(bc.offset, "remaining bytes")
    }
    return result
}

export type SqlNull = null

export type SqlInteger = i64

export function readSqlInteger(bc: bare.ByteCursor): SqlInteger {
    return bare.readI64(bc)
}

export function writeSqlInteger(bc: bare.ByteCursor, x: SqlInteger): void {
    bare.writeI64(bc, x)
}

export type SqlReal = f64

export function readSqlReal(bc: bare.ByteCursor): SqlReal {
    return bare.readF64(bc)
}

export function writeSqlReal(bc: bare.ByteCursor, x: SqlReal): void {
    bare.writeF64(bc, x)
}

export type SqlText = string

export function readSqlText(bc: bare.ByteCursor): SqlText {
    return bare.readString(bc)
}

export function writeSqlText(bc: bare.ByteCursor, x: SqlText): void {
    bare.writeString(bc, x)
}

export type SqlBlob = ArrayBuffer

export function readSqlBlob(bc: bare.ByteCursor): SqlBlob {
    return bare.readData(bc)
}

export function writeSqlBlob(bc: bare.ByteCursor, x: SqlBlob): void {
    bare.writeData(bc, x)
}

export type SqlValue =
    | { readonly tag: "SqlNull"; readonly val: SqlNull }
    | { readonly tag: "SqlInteger"; readonly val: SqlInteger }
    | { readonly tag: "SqlReal"; readonly val: SqlReal }
    | { readonly tag: "SqlText"; readonly val: SqlText }
    | { readonly tag: "SqlBlob"; readonly val: SqlBlob }

export function readSqlValue(bc: bare.ByteCursor): SqlValue {
    const offset = bc.offset
    const tag = bare.readU8(bc)
    switch (tag) {
        case 0:
            return { tag: "SqlNull", val: null }
        case 1:
            return { tag: "SqlInteger", val: readSqlInteger(bc) }
        case 2:
            return { tag: "SqlReal", val: readSqlReal(bc) }
        case 3:
            return { tag: "SqlText", val: readSqlText(bc) }
        case 4:
            return { tag: "SqlBlob", val: readSqlBlob(bc) }
        default: {
            bc.offset = offset
            throw new bare.BareError(offset, "invalid tag")
        }
    }
}

export function writeSqlValue(bc: bare.ByteCursor, x: SqlValue): void {
    switch (x.tag) {
        case "SqlNull": {
            bare.writeU8(bc, 0)
            break
        }
        case "SqlInteger": {
            bare.writeU8(bc, 1)
            writeSqlInteger(bc, x.val)
            break
        }
        case "SqlReal": {
            bare.writeU8(bc, 2)
            writeSqlReal(bc, x.val)
            break
        }
        case "SqlText": {
            bare.writeU8(bc, 3)
            writeSqlText(bc, x.val)
            break
        }
        case "SqlBlob": {
            bare.writeU8(bc, 4)
            writeSqlBlob(bc, x.val)
            break
        }
    }
}

export type SqlRow = readonly SqlValue[]

export function readSqlRow(bc: bare.ByteCursor): SqlRow {
    const len = bare.readUintSafe(bc)
    if (len === 0) {
        return []
    }
    const result = [readSqlValue(bc)]
    for (let i = 1; i < len; i++) {
        result[i] = readSqlValue(bc)
    }
    return result
}

export function writeSqlRow(bc: bare.ByteCursor, x: SqlRow): void {
    bare.writeUintSafe(bc, x.length)
    for (let i = 0; i < x.length; i++) {
        writeSqlValue(bc, x[i])
    }
}

/**
 * Multi-statement script, one job, no params, no result rows.
 */
export type SqliteExec = {
    readonly script: string
}

export function readSqliteExec(bc: bare.ByteCursor): SqliteExec {
    return {
        script: bare.readString(bc),
    }
}

export function writeSqliteExec(bc: bare.ByteCursor, x: SqliteExec): void {
    bare.writeString(bc, x.script)
}

function read0(bc: bare.ByteCursor): readonly SqlValue[] {
    const len = bare.readUintSafe(bc)
    if (len === 0) {
        return []
    }
    const result = [readSqlValue(bc)]
    for (let i = 1; i < len; i++) {
        result[i] = readSqlValue(bc)
    }
    return result
}

function write0(bc: bare.ByteCursor, x: readonly SqlValue[]): void {
    bare.writeUintSafe(bc, x.length)
    for (let i = 0; i < x.length; i++) {
        writeSqlValue(bc, x[i])
    }
}

/**
 * Single statement, positional params, returns rows and change counts.
 */
export type SqliteQuery = {
    readonly sql: string
    readonly params: readonly SqlValue[]
}

export function readSqliteQuery(bc: bare.ByteCursor): SqliteQuery {
    return {
        sql: bare.readString(bc),
        params: read0(bc),
    }
}

export function writeSqliteQuery(bc: bare.ByteCursor, x: SqliteQuery): void {
    bare.writeString(bc, x.sql)
    write0(bc, x.params)
}

function read1(bc: bare.ByteCursor): u64 | null {
    return bare.readBool(bc) ? bare.readU64(bc) : null
}

function write1(bc: bare.ByteCursor, x: u64 | null): void {
    bare.writeBool(bc, x != null)
    if (x != null) {
        bare.writeU64(bc, x)
    }
}

/**
 * Starts an explicit transaction owned by leaseKey. The optional timeout is
 * milliseconds and defaults to the runtime's 60-second safety deadline.
 */
export type SqliteBegin = {
    readonly leaseKey: string
    readonly timeoutMs: u64 | null
}

export function readSqliteBegin(bc: bare.ByteCursor): SqliteBegin {
    return {
        leaseKey: bare.readString(bc),
        timeoutMs: read1(bc),
    }
}

export function writeSqliteBegin(bc: bare.ByteCursor, x: SqliteBegin): void {
    bare.writeString(bc, x.leaseKey)
    write1(bc, x.timeoutMs)
}

export type SqliteCommit = {
    readonly leaseKey: string
}

export function readSqliteCommit(bc: bare.ByteCursor): SqliteCommit {
    return {
        leaseKey: bare.readString(bc),
    }
}

export function writeSqliteCommit(bc: bare.ByteCursor, x: SqliteCommit): void {
    bare.writeString(bc, x.leaseKey)
}

export type SqliteRollback = {
    readonly leaseKey: string
}

export function readSqliteRollback(bc: bare.ByteCursor): SqliteRollback {
    return {
        leaseKey: bare.readString(bc),
    }
}

export function writeSqliteRollback(bc: bare.ByteCursor, x: SqliteRollback): void {
    bare.writeString(bc, x.leaseKey)
}

export type RequestPayload =
    | { readonly tag: "SqliteExec"; readonly val: SqliteExec }
    | { readonly tag: "SqliteQuery"; readonly val: SqliteQuery }
    | { readonly tag: "SqliteBegin"; readonly val: SqliteBegin }
    | { readonly tag: "SqliteCommit"; readonly val: SqliteCommit }
    | { readonly tag: "SqliteRollback"; readonly val: SqliteRollback }

export function readRequestPayload(bc: bare.ByteCursor): RequestPayload {
    const offset = bc.offset
    const tag = bare.readU8(bc)
    switch (tag) {
        case 0:
            return { tag: "SqliteExec", val: readSqliteExec(bc) }
        case 1:
            return { tag: "SqliteQuery", val: readSqliteQuery(bc) }
        case 2:
            return { tag: "SqliteBegin", val: readSqliteBegin(bc) }
        case 3:
            return { tag: "SqliteCommit", val: readSqliteCommit(bc) }
        case 4:
            return { tag: "SqliteRollback", val: readSqliteRollback(bc) }
        default: {
            bc.offset = offset
            throw new bare.BareError(offset, "invalid tag")
        }
    }
}

export function writeRequestPayload(bc: bare.ByteCursor, x: RequestPayload): void {
    switch (x.tag) {
        case "SqliteExec": {
            bare.writeU8(bc, 0)
            writeSqliteExec(bc, x.val)
            break
        }
        case "SqliteQuery": {
            bare.writeU8(bc, 1)
            writeSqliteQuery(bc, x.val)
            break
        }
        case "SqliteBegin": {
            bare.writeU8(bc, 2)
            writeSqliteBegin(bc, x.val)
            break
        }
        case "SqliteCommit": {
            bare.writeU8(bc, 3)
            writeSqliteCommit(bc, x.val)
            break
        }
        case "SqliteRollback": {
            bare.writeU8(bc, 4)
            writeSqliteRollback(bc, x.val)
            break
        }
    }
}

function read2(bc: bare.ByteCursor): string | null {
    return bare.readBool(bc) ? bare.readString(bc) : null
}

function write2(bc: bare.ByteCursor, x: string | null): void {
    bare.writeBool(bc, x != null)
    if (x != null) {
        bare.writeString(bc, x)
    }
}

export type Request = {
    readonly requestId: u32
    /**
     * For Exec and Query, selects a transaction started on this connection.
     */
    readonly leaseKey: string | null
    readonly payload: RequestPayload
}

export function readRequest(bc: bare.ByteCursor): Request {
    return {
        requestId: bare.readU32(bc),
        leaseKey: read2(bc),
        payload: readRequestPayload(bc),
    }
}

export function writeRequest(bc: bare.ByteCursor, x: Request): void {
    bare.writeU32(bc, x.requestId)
    write2(bc, x.leaseKey)
    writeRequestPayload(bc, x.payload)
}

export type ClientFrame =
    | { readonly tag: "Request"; readonly val: Request }

export function readClientFrame(bc: bare.ByteCursor): ClientFrame {
    const offset = bc.offset
    const tag = bare.readU8(bc)
    switch (tag) {
        case 0:
            return { tag: "Request", val: readRequest(bc) }
        default: {
            bc.offset = offset
            throw new bare.BareError(offset, "invalid tag")
        }
    }
}

export function writeClientFrame(bc: bare.ByteCursor, x: ClientFrame): void {
    switch (x.tag) {
        case "Request": {
            bare.writeU8(bc, 0)
            writeRequest(bc, x.val)
            break
        }
    }
}

export function encodeClientFrame(x: ClientFrame, config?: Partial<bare.Config>): Uint8Array {
    const fullConfig = config != null ? bare.Config(config) : DEFAULT_CONFIG
    const bc = new bare.ByteCursor(
        new Uint8Array(fullConfig.initialBufferLength),
        fullConfig,
    )
    writeClientFrame(bc, x)
    return new Uint8Array(bc.view.buffer, bc.view.byteOffset, bc.offset)
}

export function decodeClientFrame(bytes: Uint8Array): ClientFrame {
    const bc = new bare.ByteCursor(bytes, DEFAULT_CONFIG)
    const result = readClientFrame(bc)
    if (bc.offset < bc.view.byteLength) {
        throw new bare.BareError(bc.offset, "remaining bytes")
    }
    return result
}

export type SqliteExecOk = null

export type SqliteBeginOk = null

export type SqliteCommitOk = null

export type SqliteRollbackOk = null

function read3(bc: bare.ByteCursor): readonly string[] {
    const len = bare.readUintSafe(bc)
    if (len === 0) {
        return []
    }
    const result = [bare.readString(bc)]
    for (let i = 1; i < len; i++) {
        result[i] = bare.readString(bc)
    }
    return result
}

function write3(bc: bare.ByteCursor, x: readonly string[]): void {
    bare.writeUintSafe(bc, x.length)
    for (let i = 0; i < x.length; i++) {
        bare.writeString(bc, x[i])
    }
}

function read4(bc: bare.ByteCursor): readonly SqlRow[] {
    const len = bare.readUintSafe(bc)
    if (len === 0) {
        return []
    }
    const result = [readSqlRow(bc)]
    for (let i = 1; i < len; i++) {
        result[i] = readSqlRow(bc)
    }
    return result
}

function write4(bc: bare.ByteCursor, x: readonly SqlRow[]): void {
    bare.writeUintSafe(bc, x.length)
    for (let i = 0; i < x.length; i++) {
        writeSqlRow(bc, x[i])
    }
}

function read5(bc: bare.ByteCursor): i64 | null {
    return bare.readBool(bc) ? bare.readI64(bc) : null
}

function write5(bc: bare.ByteCursor, x: i64 | null): void {
    bare.writeBool(bc, x != null)
    if (x != null) {
        bare.writeI64(bc, x)
    }
}

export type SqliteQueryOk = {
    readonly columns: readonly string[]
    readonly rows: readonly SqlRow[]
    readonly changes: i64
    readonly lastInsertRowId: i64 | null
}

export function readSqliteQueryOk(bc: bare.ByteCursor): SqliteQueryOk {
    return {
        columns: read3(bc),
        rows: read4(bc),
        changes: bare.readI64(bc),
        lastInsertRowId: read5(bc),
    }
}

export function writeSqliteQueryOk(bc: bare.ByteCursor, x: SqliteQueryOk): void {
    write3(bc, x.columns)
    write4(bc, x.rows)
    bare.writeI64(bc, x.changes)
    write5(bc, x.lastInsertRowId)
}

export type SqlError = {
    readonly code: i32
    readonly statementIndex: u32
    readonly message: string
}

export function readSqlError(bc: bare.ByteCursor): SqlError {
    return {
        code: bare.readI32(bc),
        statementIndex: bare.readU32(bc),
        message: bare.readString(bc),
    }
}

export function writeSqlError(bc: bare.ByteCursor, x: SqlError): void {
    bare.writeI32(bc, x.code)
    bare.writeU32(bc, x.statementIndex)
    bare.writeString(bc, x.message)
}

export type EndpointClosed = null

export type QueueFull = {
    readonly limit: string
    readonly capacity: u32
}

export function readQueueFull(bc: bare.ByteCursor): QueueFull {
    return {
        limit: bare.readString(bc),
        capacity: bare.readU32(bc),
    }
}

export function writeQueueFull(bc: bare.ByteCursor, x: QueueFull): void {
    bare.writeString(bc, x.limit)
    bare.writeU32(bc, x.capacity)
}

/**
 * The key was missing, unknown, owned by another connection, or already
 * committed/rolled back. The request was not executed.
 */
export type InvalidLeaseKey = {
    readonly message: string
}

export function readInvalidLeaseKey(bc: bare.ByteCursor): InvalidLeaseKey {
    return {
        message: bare.readString(bc),
    }
}

export function writeInvalidLeaseKey(bc: bare.ByteCursor, x: InvalidLeaseKey): void {
    bare.writeString(bc, x.message)
}

/**
 * The key's deadline fired (or its connection closed) and its transaction was
 * rolled back. The request was not executed.
 */
export type LeaseExpired = {
    readonly timeoutMs: u64
    readonly message: string
}

export function readLeaseExpired(bc: bare.ByteCursor): LeaseExpired {
    return {
        timeoutMs: bare.readU64(bc),
        message: bare.readString(bc),
    }
}

export function writeLeaseExpired(bc: bare.ByteCursor, x: LeaseExpired): void {
    bare.writeU64(bc, x.timeoutMs)
    bare.writeString(bc, x.message)
}

/**
 * The statement executed, but its serialized response exceeded maxFrameBytes.
 */
export type ResponseTooLarge = null

export type ResponsePayload =
    | { readonly tag: "SqliteExecOk"; readonly val: SqliteExecOk }
    | { readonly tag: "SqliteQueryOk"; readonly val: SqliteQueryOk }
    | { readonly tag: "SqliteBeginOk"; readonly val: SqliteBeginOk }
    | { readonly tag: "SqliteCommitOk"; readonly val: SqliteCommitOk }
    | { readonly tag: "SqliteRollbackOk"; readonly val: SqliteRollbackOk }
    | { readonly tag: "SqlError"; readonly val: SqlError }
    | { readonly tag: "EndpointClosed"; readonly val: EndpointClosed }
    | { readonly tag: "QueueFull"; readonly val: QueueFull }
    | { readonly tag: "InvalidLeaseKey"; readonly val: InvalidLeaseKey }
    | { readonly tag: "LeaseExpired"; readonly val: LeaseExpired }
    | { readonly tag: "ResponseTooLarge"; readonly val: ResponseTooLarge }

export function readResponsePayload(bc: bare.ByteCursor): ResponsePayload {
    const offset = bc.offset
    const tag = bare.readU8(bc)
    switch (tag) {
        case 0:
            return { tag: "SqliteExecOk", val: null }
        case 1:
            return { tag: "SqliteQueryOk", val: readSqliteQueryOk(bc) }
        case 2:
            return { tag: "SqliteBeginOk", val: null }
        case 3:
            return { tag: "SqliteCommitOk", val: null }
        case 4:
            return { tag: "SqliteRollbackOk", val: null }
        case 5:
            return { tag: "SqlError", val: readSqlError(bc) }
        case 6:
            return { tag: "EndpointClosed", val: null }
        case 7:
            return { tag: "QueueFull", val: readQueueFull(bc) }
        case 8:
            return { tag: "InvalidLeaseKey", val: readInvalidLeaseKey(bc) }
        case 9:
            return { tag: "LeaseExpired", val: readLeaseExpired(bc) }
        case 10:
            return { tag: "ResponseTooLarge", val: null }
        default: {
            bc.offset = offset
            throw new bare.BareError(offset, "invalid tag")
        }
    }
}

export function writeResponsePayload(bc: bare.ByteCursor, x: ResponsePayload): void {
    switch (x.tag) {
        case "SqliteExecOk": {
            bare.writeU8(bc, 0)
            break
        }
        case "SqliteQueryOk": {
            bare.writeU8(bc, 1)
            writeSqliteQueryOk(bc, x.val)
            break
        }
        case "SqliteBeginOk": {
            bare.writeU8(bc, 2)
            break
        }
        case "SqliteCommitOk": {
            bare.writeU8(bc, 3)
            break
        }
        case "SqliteRollbackOk": {
            bare.writeU8(bc, 4)
            break
        }
        case "SqlError": {
            bare.writeU8(bc, 5)
            writeSqlError(bc, x.val)
            break
        }
        case "EndpointClosed": {
            bare.writeU8(bc, 6)
            break
        }
        case "QueueFull": {
            bare.writeU8(bc, 7)
            writeQueueFull(bc, x.val)
            break
        }
        case "InvalidLeaseKey": {
            bare.writeU8(bc, 8)
            writeInvalidLeaseKey(bc, x.val)
            break
        }
        case "LeaseExpired": {
            bare.writeU8(bc, 9)
            writeLeaseExpired(bc, x.val)
            break
        }
        case "ResponseTooLarge": {
            bare.writeU8(bc, 10)
            break
        }
    }
}

export type Response = {
    readonly requestId: u32
    readonly payload: ResponsePayload
}

export function readResponse(bc: bare.ByteCursor): Response {
    return {
        requestId: bare.readU32(bc),
        payload: readResponsePayload(bc),
    }
}

export function writeResponse(bc: bare.ByteCursor, x: Response): void {
    bare.writeU32(bc, x.requestId)
    writeResponsePayload(bc, x.payload)
}

export type FrameTooLarge = null

export type MalformedFrame = null

export type GoAwayReason =
    | { readonly tag: "FrameTooLarge"; readonly val: FrameTooLarge }
    | { readonly tag: "MalformedFrame"; readonly val: MalformedFrame }

export function readGoAwayReason(bc: bare.ByteCursor): GoAwayReason {
    const offset = bc.offset
    const tag = bare.readU8(bc)
    switch (tag) {
        case 0:
            return { tag: "FrameTooLarge", val: null }
        case 1:
            return { tag: "MalformedFrame", val: null }
        default: {
            bc.offset = offset
            throw new bare.BareError(offset, "invalid tag")
        }
    }
}

export function writeGoAwayReason(bc: bare.ByteCursor, x: GoAwayReason): void {
    switch (x.tag) {
        case "FrameTooLarge": {
            bare.writeU8(bc, 0)
            break
        }
        case "MalformedFrame": {
            bare.writeU8(bc, 1)
            break
        }
    }
}

export type GoAway = {
    readonly reason: GoAwayReason
}

export function readGoAway(bc: bare.ByteCursor): GoAway {
    return {
        reason: readGoAwayReason(bc),
    }
}

export function writeGoAway(bc: bare.ByteCursor, x: GoAway): void {
    writeGoAwayReason(bc, x.reason)
}

export type ServerFrame =
    | { readonly tag: "Response"; readonly val: Response }
    | { readonly tag: "GoAway"; readonly val: GoAway }

export function readServerFrame(bc: bare.ByteCursor): ServerFrame {
    const offset = bc.offset
    const tag = bare.readU8(bc)
    switch (tag) {
        case 0:
            return { tag: "Response", val: readResponse(bc) }
        case 1:
            return { tag: "GoAway", val: readGoAway(bc) }
        default: {
            bc.offset = offset
            throw new bare.BareError(offset, "invalid tag")
        }
    }
}

export function writeServerFrame(bc: bare.ByteCursor, x: ServerFrame): void {
    switch (x.tag) {
        case "Response": {
            bare.writeU8(bc, 0)
            writeResponse(bc, x.val)
            break
        }
        case "GoAway": {
            bare.writeU8(bc, 1)
            writeGoAway(bc, x.val)
            break
        }
    }
}

export function encodeServerFrame(x: ServerFrame, config?: Partial<bare.Config>): Uint8Array {
    const fullConfig = config != null ? bare.Config(config) : DEFAULT_CONFIG
    const bc = new bare.ByteCursor(
        new Uint8Array(fullConfig.initialBufferLength),
        fullConfig,
    )
    writeServerFrame(bc, x)
    return new Uint8Array(bc.view.buffer, bc.view.byteOffset, bc.offset)
}

export function decodeServerFrame(bytes: Uint8Array): ServerFrame {
    const bc = new bare.ByteCursor(bytes, DEFAULT_CONFIG)
    const result = readServerFrame(bc)
    if (bc.offset < bc.view.byteLength) {
        throw new bare.BareError(bc.offset, "remaining bytes")
    }
    return result
}


function assert(condition: boolean, message?: string): asserts condition {
    if (!condition) throw new Error(message ?? "Assertion failed")
}
