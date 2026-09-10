import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ReactionDto {
  @IsString()
  @IsNotEmpty()
  emoji: string;
}

export class CreateTaskFromMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsArray()
  @IsString({ each: true })
  assigneeIds: string[];

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

export class CreatePollDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options: string[];

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isMultiSelect?: boolean;
}

export class VotePollDto {
  @IsString()
  @IsNotEmpty()
  optionId: string;
}

export class PinMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}

export class ForwardMessageDto {
  @IsString()
  @IsNotEmpty()
  targetConversationId: string;
}
