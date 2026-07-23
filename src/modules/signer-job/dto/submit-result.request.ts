import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';
import { SignerResultDto } from './signer-result.dto';

/**
 * Request body for `POST /signer/jobs/:requestId/result`.
 */
export class SubmitResultRequest {
  @ApiProperty({
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    description: 'UUID echoed from SignerPayload.requestId. Must match the :requestId path parameter.',
  })
  @IsString()
  @IsNotEmpty()
  public requestId!: string;

  @ApiProperty({
    example: '304402201...',
    description: 'Hex-encoded signature bytes. SENSITIVE — never log. Min 1, max 1024 hex chars.',
    minLength: 1,
    maxLength: 1024,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1024)
  public signature!: string;

  @ApiProperty({
    enum: SignAlgorithm,
    example: SignAlgorithm.ECDSA_SECP256K1,
    description: 'Algorithm used for signing. Must match the stored SignerPayload.signAlgorithm.',
  })
  @IsEnum(SignAlgorithm)
  public signatureAlgorithm!: SignAlgorithm;

  @ApiProperty({
    example: 'sha256:ab12cd...',
    description: 'Short fingerprint of the public key used. For audit. Max 128 chars.',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  public publicKeyFingerprint!: string;

  @ApiProperty({
    example: '2026-07-22T19:00:00.000Z',
    description: 'ISO 8601 UTC timestamp of signing completion. Must be within the job validity window.',
  })
  @IsISO8601()
  @IsNotEmpty()
  public completedAt!: string;

  @ApiProperty({
    type: () => SignerResultDto,
    description: 'Full SignerResult contract. All fields are validated.',
  })
  @ValidateNested()
  @Type(() => SignerResultDto)
  public result!: SignerResultDto;
}
