import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ProfilePreferencesPatchDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  dietary_preferences?: string[] | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  allergies?: string[] | null;
}

export class PatchConsumerProfileDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ProfilePreferencesPatchDto)
  preferences?: ProfilePreferencesPatchDto;
}
