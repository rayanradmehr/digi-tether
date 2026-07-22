import { Injectable } from '@nestjs/common';
import type { Token } from '../entities/token.entity';
import { TokenResponseDto } from '../dto/token-response.dto';

/**
 * Maps `Token` entity instances to their public API response shape.
 *
 * This is the single authoritative mapping function for the Token Module.
 * Any change to the public response shape (e.g., adding a computed field)
 * is made here and only here.
 *
 * Design rules
 * ------------
 * - Pure function semantics — no side effects, no I/O.
 * - Always synchronous — entity → DTO mapping never requires async operations.
 * - Never exposes `deletedAt` or `version` (infrastructure fields).
 * - Never imports services or repositories.
 * - Registered as an injectable provider so `TokenService` can receive it
 *   via constructor injection and tests can mock it independently.
 */
@Injectable()
export class TokenMapper {
  /**
   * Converts a single `Token` entity to `TokenResponseDto`.
   *
   * Deliberately excludes:
   * - `deletedAt`  — soft-delete timestamp is not a public concern.
   * - `version`    — optimistic lock counter is not a public concern.
   *
   * @param token - Hydrated `Token` entity from the repository.
   * @returns The public API representation of the token.
   */
  public toResponseDto(token: Token): TokenResponseDto {
    const dto = new TokenResponseDto();
    dto.id = token.id;
    dto.networkId = token.networkId;
    dto.type = token.type;
    dto.standard = token.standard;
    dto.name = token.name;
    dto.symbol = token.symbol;
    dto.decimals = token.decimals;
    dto.contractAddress = token.contractAddress;
    dto.status = token.status;
    dto.confirmationsOverride = token.confirmationsOverride;
    dto.logoUrl = token.logoUrl;
    dto.description = token.description;
    dto.createdAt = token.createdAt;
    dto.updatedAt = token.updatedAt;
    return dto;
  }
}
