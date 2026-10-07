/**
 * Tests for custom exceptions
 */

import {
	ConflictException,
	QBitFlowError,
	NotFoundException,
	UnauthorizedException,
	ForbiddenException,
	ValidationException,
	RateLimitException,
	ServerException,
	NetworkException,
} from '../src/exceptions';

describe('Exceptions', () => {
	describe('QBitFlowError', () => {
		it('should create error with message', () => {
			const error = new QBitFlowError('Test error');
			expect(error.message).toBe('Test error');
			expect(error.name).toBe('QBitFlowError');
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('NotFoundException', () => {
		it('should create error with custom message', () => {
			const error = new NotFoundException('Custom not found');
			expect(error.message).toBe('Custom not found');
			expect(error.name).toBe('NotFoundException');
			expect(error).toBeInstanceOf(QBitFlowError);
		});

		it('should use default message', () => {
			const error = new NotFoundException();
			expect(error.message).toBe('Resource not found');
		});
	});

	describe('UnauthorizedException', () => {
		it('should create error with custom message', () => {
			const error = new UnauthorizedException('Custom unauthorized');
			expect(error.message).toBe('Custom unauthorized');
			expect(error.name).toBe('UnauthorizedException');
		});

		it('should use default message', () => {
			const error = new UnauthorizedException();
			expect(error.message).toBe('Unauthorized: Invalid API key');
		});
	});

	describe('ForbiddenException', () => {
		it('should create error with custom message', () => {
			const error = new ForbiddenException('Custom forbidden');
			expect(error.message).toBe('Custom forbidden');
			expect(error.name).toBe('ForbiddenException');
		});
	});

	describe('ValidationException', () => {
		it('should create error with custom message', () => {
			const error = new ValidationException('Invalid input');
			expect(error.message).toBe('Invalid input');
			expect(error.name).toBe('ValidationException');
		});
	});

	describe('RateLimitException', () => {
		it('should create error with custom message', () => {
			const error = new RateLimitException('Too many requests');
			expect(error.message).toBe('Too many requests');
			expect(error.name).toBe('RateLimitException');
		});
	});

	describe('ServerException', () => {
		it('should create error with custom message', () => {
			const error = new ServerException('Server error');
			expect(error.message).toBe('Server error');
			expect(error.name).toBe('ServerException');
		});
	});

	describe('NetworkException', () => {
		it('should create error with custom message', () => {
			const error = new NetworkException('Network error');
			expect(error.message).toBe('Network error');
			expect(error.name).toBe('NetworkException');
		});
	});
});

describe('Exception details (2.5.0)', () => {
	it('canonical classes default their statusCode; base and validation leave it undefined', () => {
		expect(new NotFoundException().statusCode).toBe(404);
		expect(new UnauthorizedException().statusCode).toBe(401);
		expect(new ForbiddenException().statusCode).toBe(403);
		expect(new ConflictException().statusCode).toBe(409);
		expect(new RateLimitException().statusCode).toBe(429);
		expect(new ValidationException('client-side').statusCode).toBeUndefined();
		expect(new QBitFlowError('base').statusCode).toBeUndefined();
		expect(new ServerException('x', { statusCode: 502 }).statusCode).toBe(502);
	});

	it('carries fields and retryAfter', () => {
		const fields = [{ field: 'Price', message: 'Price is too short' }];
		const v = new ValidationException('bad', { fields, statusCode: 400 });
		expect(v.fields).toEqual(fields);
		expect(v.statusCode).toBe(400);
		const r = new RateLimitException('slow', { retryAfter: 12 });
		expect(r.retryAfter).toBe(12);
		expect(r.fields).toEqual([]);
		expect(new ConflictException('not due')).toBeInstanceOf(QBitFlowError);
	});
});
