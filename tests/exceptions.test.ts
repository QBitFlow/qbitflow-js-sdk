/**
 * Tests for custom exceptions
 */

import {
	QBitFlowError,
	NotFoundException,
	UnauthorizedException,
	ForbiddenException,
	ValidationException,
	RateLimitException,
	ServerException,
	NetworkException,
	WebSocketException,
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

	describe('WebSocketException', () => {
		it('should create error with custom message', () => {
			const error = new WebSocketException('WebSocket error');
			expect(error.message).toBe('WebSocket error');
			expect(error.name).toBe('WebSocketException');
		});
	});
});
